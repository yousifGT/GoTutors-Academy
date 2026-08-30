import { NextResponse } from "next/server";
import { withRoute } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { viewerOr401 } from "@/lib/session";
import { inspectionScope, type Viewer } from "@/lib/access";
import { contentTypeForKey, hrefsForKey, keyFromHref, openUpload } from "@/lib/storage";

interface Ctx {
  params: { key: string[] };
}

/**
 * Serve one photo or signature.
 *
 * Uploads are not public files. A random 32-character name makes a URL hard to
 * guess, but "hard to guess" is not an access policy for photographs taken
 * inside a children's setting: this route decides, per request, whether the
 * person asking may see the inspection the image belongs to.
 *
 * An image nobody may see is reported as missing rather than forbidden, exactly
 * as scoped reads elsewhere are — a 403 would confirm that a given photo exists.
 */
export const GET = withRoute(async (_req: Request, { params }: Ctx) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const key = keyFromHref(`/api/uploads/${(params.key ?? []).join("/")}`);
  if (!key) return notFound();

  if (!(await mayRead(who.viewer, key))) return notFound();

  const body = await openUpload(key);
  if (!body) return notFound();

  return new NextResponse(body, {
    status: 200,
    headers: {
      // From the key, never from anything the uploader sent: a stored file's
      // type is decided when it is accepted, not when it is served.
      "content-type": contentTypeForKey(key),
      // Private: a shared cache must never hold an image whose visibility was
      // decided from the caller's session.
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
});

/**
 * Whether this viewer may see the object.
 *
 * Two ways in: the image is attached to an inspection they may read, or they
 * uploaded it themselves. The second is not a loophole — it is the same person
 * who took the photograph, moments earlier, and it is what makes the preview
 * work before the autosave that attaches it has landed.
 */
async function mayRead(viewer: Viewer, key: string): Promise<boolean> {
  const urls = hrefsForKey(key);
  const scope = inspectionScope(viewer);

  const [photo, signature, own] = await Promise.all([
    prisma.photo.findFirst({
      where: { url: { in: urls }, entry: { answer: { inspection: scope } } },
      select: { id: true },
    }),
    prisma.inspection.findFirst({
      where: { AND: [{ debriefSignatureUrl: { in: urls } }, scope] },
      select: { id: true },
    }),
    prisma.upload.findFirst({ where: { key, uploadedById: viewer.id }, select: { key: true } }),
  ]);

  return !!(photo || signature || own);
}

function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404, headers: noStore() });
}

function noStore() {
  return { "cache-control": "no-store" };
}
