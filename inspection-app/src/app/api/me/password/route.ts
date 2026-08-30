import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/user-rules";

const Schema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(1).max(200),
});

/**
 * Change your own password.
 *
 * An administrator sets the first one, which means they know it — so everyone
 * needs a way to replace it with something only they know. The current password
 * is required: a borrowed, unlocked session must not be enough to take an
 * account over.
 */
export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  if (!(await rateLimit(`password:${who.viewer.id}`, 5, 300)).ok)
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });

  const parsed = await parseJson(req, Schema);
  if (!parsed.ok) return parsed.response;
  const { current, next } = parsed.data;

  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (current === next)
    return NextResponse.json({ error: "That is the password you already have." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: who.viewer.id }, select: { password: true } });
  if (!user || !(await bcrypt.compare(current, user.password)))
    return NextResponse.json({ error: "Your current password is not right." }, { status: 400 });

  await prisma.user.update({
    where: { id: who.viewer.id },
    data: { password: await bcrypt.hash(next, 12) },
  });
  await audit({ actorId: who.viewer.id, action: "user.password_change", target: who.viewer.id });

  return NextResponse.json({ ok: true });
});
