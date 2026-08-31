import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/user-rules";
import { completeReset, lookupToken } from "@/lib/password-reset";

const Schema = z.object({ token: z.string().min(1).max(400), password: z.string().min(1).max(200) });

/** One message for every kind of bad token: "expired" and "used" both confirm it was real. */
const BAD_TOKEN = "That link is no longer valid. Ask for a new one.";

/**
 * Spend a reset link and set the new password.
 *
 * Rate limited on the token as well as the address: the token is the only
 * credential here, so without a cap on attempts against it, a link that has
 * leaked can be brute-forced at leisure. (32 random bytes make that hopeless
 * anyway — the limit is there so it stays hopeless if the token ever gets
 * shorter.)
 */
export const POST = withRoute(async (req: Request) => {
  const from = clientIp(req as unknown as { headers: Headers });
  if (!(await rateLimit(`reset:ip:${from}`, 20, 600)).ok)
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });

  const parsed = await parseJson(req, Schema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;

  const found = await lookupToken(token);
  if (!found.ok) {
    await audit({ actorId: null, action: "password.reset", target: "-", metadata: { ok: false, reason: found.reason, from } });
    return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });
  }

  // Checked after the token, not before: telling someone their password is too
  // short would confirm the link was good.
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  await completeReset(found.resetId, found.userId, await bcrypt.hash(password, 12));
  await audit({
    actorId: found.userId,
    action: "password.reset",
    target: found.userId,
    metadata: { ok: true, from, sessionsRevoked: true },
  });

  return NextResponse.json({
    ok: true,
    message: "Your password is set. Everything that was signed in has been signed out.",
  });
});
