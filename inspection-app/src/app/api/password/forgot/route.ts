import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createReset, resetUrl, tooManyOpenResets } from "@/lib/password-reset";
import { sendEmail } from "@/lib/email";
import { RESET_TTL_MIN } from "@/lib/password-reset";

const Schema = z.object({ email: z.string().email().max(320) });

/**
 * Ask for a link to set a new password.
 *
 * The answer is always the same, whatever happens after the address is read:
 * whether an account exists, whether it is active, whether too many links are
 * already outstanding, whether the mail was accepted. This is a company's staff
 * list, and confirming that a particular person works here is worth something
 * on its own to whoever is phishing them.
 *
 * Everything that goes wrong is logged and audited instead, so the same
 * question can be answered from inside.
 */
const SAME_ANSWER = {
  ok: true,
  message: "If that address has an account, a link to set a new password is on its way.",
};

export const POST = withRoute(async (req: Request) => {
  const from = clientIp(req as unknown as { headers: Headers });

  // Per address as well as per email: without the address limit, someone who
  // knows a colleague's email can fill their inbox from an address they will
  // not think to filter.
  const [byIp, parsed] = await Promise.all([rateLimit(`forgot:ip:${from}`, 20, 600), parseJson(req, Schema)]);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.toLowerCase();
  const byEmail = await rateLimit(`forgot:email:${email}`, 5, 600);
  // Still the same answer. A 429 here would say "this address is worth
  // limiting", which is the thing being kept back.
  if (!byIp.ok || !byEmail.ok) return NextResponse.json(SAME_ANSWER);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, active: true },
  });

  if (!user || !user.active || (await tooManyOpenResets(user.id))) {
    await audit({
      actorId: user?.id ?? null,
      action: "password.forgot",
      target: email,
      metadata: { sent: false, reason: !user ? "no account" : !user.active ? "inactive" : "too many open", from },
    });
    return NextResponse.json(SAME_ANSWER);
  }

  const token = await createReset(user.id, from);
  try {
    await sendEmail({
      to: user.email,
      subject: "Set a new GoTutors Inspections password",
      text: [
        `Hello ${user.name.trim().split(/\s+/)[0] || "there"},`,
        ``,
        `Someone asked to set a new password for this account. If that was you, open this link:`,
        resetUrl(token),
        ``,
        `It works once, and stops working after ${RESET_TTL_MIN} minutes.`,
        ``,
        `If it was not you, nothing has changed and you can ignore this message — but tell whoever runs your centre, so they know somebody tried.`,
        ``,
        `GoTutors Inspections`,
      ].join("\n"),
    });
    await audit({ actorId: user.id, action: "password.forgot", target: email, metadata: { sent: true, from } });
  } catch (e) {
    // The caller is told nothing either way. An error here says the address is
    // real, which is exactly what this endpoint exists not to say.
    console.error("password reset email failed", { email, err: e });
    await audit({
      actorId: user.id,
      action: "password.forgot",
      target: email,
      metadata: { sent: false, reason: "send failed", from },
    });
  }

  return NextResponse.json(SAME_ANSWER);
});
