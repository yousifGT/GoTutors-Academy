import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { saveUploadedPaper } from "@/lib/storage";
import { viewerOrNull } from "@/lib/session";
import { withRoute } from "@/lib/api";

/** What the marking model can actually read. HEIC is not on this list. */
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
/** The API rejects images much above this, and a phone photo is well under it. */
const MAX_BYTES = 8 * 1024 * 1024;

export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // A lost paper cannot be recovered inside the product — the test exists on
  // paper and has gone home in a bag. Refuse rather than write to a container
  // filesystem that the next deploy wipes.
  if (process.env.NODE_ENV === "production" && process.env.UPLOAD_BACKEND !== "s3") {
    return NextResponse.json(
      { error: "Uploads are turned off because no durable file storage is configured. Set UPLOAD_BACKEND=s3 first." },
      { status: 503 }
    );
  }

  const rl = rateLimit(`upload:${viewer.id}`, 60, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Photos must be JPEG, PNG or WebP. iPhone HEIC photos need converting first." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That photo is over 8 MB. Take it at a lower resolution." }, { status: 413 });
  }

  return NextResponse.json({ url: await saveUploadedPaper(file) });
});
