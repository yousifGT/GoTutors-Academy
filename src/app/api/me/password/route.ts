import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/csrf";
import { zPassword } from "@/lib/validate";
import { z } from "zod";

/**
 * Change your own password.
 *
 * There was previously no way for anyone to do this. An admin could set someone
 * a temporary password and the UI told them to "change it from their profile",
 * but no such control existed — so the temporary password became permanent and
 * stayed known to two people.
 *
 * Requires the current password: a hijacked session should not be able to lock
 * the real owner out of their account.
 */

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: zPassword,
});

export async function PATCH(req: Request) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Guessing the current password is a credential attack; rate limit it like sign-in.
  const rl = rateLimit(`password:${session.user.id}`, 5, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A current password and a new password of at least 6 characters are required." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, password: true } });
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return NextResponse.json({ error: "Your current password is not correct." }, { status: 403 });
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    return NextResponse.json({ error: "Your new password must be different from your current one." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    // Choosing their own password clears any admin-set temporary one.
    data: { password: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
  });

  // Never log the password itself, only that it changed.
  await audit({ actorId: user.id, action: "user.password_changed_self", target: user.id });

  return NextResponse.json({ ok: true });
}
