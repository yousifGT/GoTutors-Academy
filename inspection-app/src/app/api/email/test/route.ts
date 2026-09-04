import { NextResponse } from "next/server";
import { z } from "zod";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageUsers } from "@/lib/access";
import { sendEmail, emailBackend } from "@/lib/email";
import { emailSettings } from "@/lib/email-config";

const TestSchema = z.object({ to: z.string().trim().toLowerCase().email() });

/**
 * Send a short message, to prove the mail settings work.
 *
 * Until this existed, the only way to find out whether email was configured
 * correctly was to carry out a whole inspection and submit it — and if nothing
 * arrived, to work out from a delivery row and a log line which of a dozen
 * settings was wrong. That is a poor way to discover that a port is 465 rather
 * than 587, and a worse way to discover it on the day of a deployment.
 *
 * Super admin only. It sends real mail from the real account, and the reason to
 * keep the mail settings with account administration is the same reason to keep
 * this with it.
 *
 * The error comes back verbatim. "Could not send" tells nobody anything;
 * "535 5.7.3 Authentication unsuccessful" is the answer. These messages come
 * from the mail server rather than from a user, and the person reading it is
 * the one holding the credentials.
 */
export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageUsers(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, TestSchema);
  if (!parsed.ok) return parsed.response;
  const to = parsed.data.to;

  const settings = emailSettings();
  if (emailBackend() === "console")
    return NextResponse.json(
      {
        error:
          "EMAIL_BACKEND is not set, so messages are written to the server log instead of being sent. Set it to smtp or ses and restart.",
        settings,
      },
      { status: 409 }
    );

  const at = new Date();
  try {
    await sendEmail({
      to,
      subject: "GoTutors inspections — test message",
      text:
        `This is a test from the GoTutors inspection app, sent at ${at.toISOString()}.\n\n` +
        `If you are reading it, reports will reach this address.\n\n` +
        `Sent from: ${settings.from}\n` +
        `Backend: ${settings.backend}${settings.host ? ` via ${settings.host}:${settings.port}` : ""}\n`,
      html:
        `<p>This is a test from the GoTutors inspection app, sent at ${at.toISOString()}.</p>` +
        `<p>If you are reading it, reports will reach this address.</p>` +
        `<p style="color:#64748b;font-size:13px">Sent from: ${settings.from}<br>` +
        `Backend: ${settings.backend}${settings.host ? ` via ${settings.host}:${settings.port}` : ""}</p>`,
    });
    await audit({ actorId: who.viewer.id, action: "email.test", target: to, metadata: { backend: settings.backend, from: settings.from } });
    return NextResponse.json({ ok: true, to, from: settings.from });
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 800);
    await audit({
      actorId: who.viewer.id,
      action: "email.test",
      target: to,
      metadata: { backend: settings.backend, from: settings.from, problem: error },
    });
    return NextResponse.json({ ok: false, error, settings }, { status: 502 });
  }
});
