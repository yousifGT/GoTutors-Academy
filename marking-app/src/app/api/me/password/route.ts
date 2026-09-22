import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { parseJson, zPassword } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { audit } from "@/lib/audit";
import { rateLimit, tooMany } from "@/lib/rate-limit";

const PasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: zPassword });

export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rl = rateLimit(`password:${viewer.id}`, 10, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const parsed = await parseJson(req, PasswordSchema);
  if (!parsed.ok) return parsed.response;

  const user = await prisma.user.findUnique({ where: { id: viewer.id }, select: { password: true } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.password))) {
    return NextResponse.json({ error: "That is not your current password." }, { status: 403 });
  }
  if (await bcrypt.compare(parsed.data.newPassword, user.password)) {
    return NextResponse.json({ error: "Pick a password you have not used here before." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: viewer.id },
    // Clearing the hold is the whole point: until it clears, the middleware
    // keeps this person on the change-password screen.
    data: { password: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false },
  });
  await audit({ organisationId: viewer.organisationId, actorId: viewer.id, action: "user.password.change" });
  return NextResponse.json({ ok: true });
});
