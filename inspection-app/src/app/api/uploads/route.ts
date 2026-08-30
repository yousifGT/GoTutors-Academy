import { NextResponse } from "next/server";
import { withRoute } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { viewerOr401 } from "@/lib/session";
import { canConduct } from "@/lib/access";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_BYTES, UPLOAD_KINDS, isAcceptedType, saveUpload, type UploadKind } from "@/lib/storage";

/**
 * Store one photo or signature and return its URL, which the caller then
 * attaches to an answer entry via PATCH /api/inspections/:id.
 *
 * Only someone who carries out inspections may upload — this endpoint writes
 * files, so it must not be open to every signed-in reader.
 *
 * The upload is recorded against the person who made it. Between this call and
 * the autosave that attaches the photo, the file belongs to no inspection, and
 * that row is the only thing that lets its own photographer see the preview.
 */
export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canConduct(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // A visit generates a lot of photos, but not hundreds a minute.
  if (!(await rateLimit(`upload:${who.viewer.id}`, 60, 60)).ok)
    return NextResponse.json({ error: "Too many uploads, slow down" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "photo") as UploadKind;

  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!UPLOAD_KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  if (!isAcceptedType(file.type))
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 415 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "That image is too large (max 12MB)" }, { status: 413 });

  const saved = await saveUpload(file, kind);
  await prisma.upload.create({
    data: {
      key: saved.key,
      kind,
      contentType: saved.contentType,
      bytes: saved.bytes,
      backend: saved.backend,
      uploadedById: who.viewer.id,
    },
  });

  return NextResponse.json({ url: saved.href }, { status: 201 });
});
