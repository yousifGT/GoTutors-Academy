import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { saveUploadedVideo } from "@/lib/storage";

const ALLOWED = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Cap uploads at 5 per minute per user
  const rl = rateLimit(`upload:${session.user.id}`, 5, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Unsupported video type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const url = await saveUploadedVideo(file);
  return NextResponse.json({ url });
}
