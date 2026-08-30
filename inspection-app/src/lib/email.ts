/**
 * Sending mail.
 *
 * Three backends, chosen by EMAIL_BACKEND:
 *
 *   ses      Amazon SES. The one for a deployment on AWS.
 *   smtp     Any SMTP server, for an operator who already has one.
 *   console  Writes the message to the log instead of sending it. The default,
 *            so a developer running this locally cannot accidentally post real
 *            inspection reports to real people while trying things out.
 *
 * `console` being the default is deliberate, and the boot check in
 * src/lib/config.ts is what stops it becoming a silent production failure: a
 * deployment that forgets EMAIL_BACKEND does not start.
 *
 * Messages are built as MIME here and handed to the backend whole. Both SES and
 * SMTP take a raw message, so the two paths differ only in transport — an
 * attachment that renders correctly through one renders correctly through the
 * other, rather than being assembled twice and only tested once.
 */

import { emailBackend, emailConfigProblems, emailFrom, envelopeFrom } from "@/lib/email-config";

export { emailBackend, emailFrom, type EmailBackend } from "@/lib/email-config";

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

/** The MIME message, exactly as it will go out. */
export async function buildMessage(mail: Mail, env: NodeJS.ProcessEnv = process.env): Promise<Buffer> {
  // Imported here rather than at the top of the file: this module is reachable
  // from code that only ever reads the configuration, and the mail library
  // cannot be bundled for the Edge runtime.
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  const composer = new MailComposer({
    from: emailFrom(env),
    to: mail.to,
    replyTo: env.EMAIL_REPLY_TO || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return composer.compile().build();
}

/**
 * Send one message, or throw.
 *
 * Throwing rather than returning a result is on purpose: every caller records
 * the outcome against a delivery row, and a failure that can be ignored by
 * forgetting to check a boolean is a report that silently never arrives.
 */
export async function sendEmail(mail: Mail): Promise<void> {
  const backend = emailBackend();
  const missing = emailConfigProblems();
  if (missing.length) throw new Error(`EMAIL_BACKEND=${backend} but not configured: ${missing.join(", ")}`);

  const raw = await buildMessage(mail);
  if (backend === "ses") return sendViaSes(raw);
  if (backend === "smtp") return sendViaSmtp(raw, mail.to);
  return logInstead(mail, raw);
}

async function sendViaSes(raw: Buffer): Promise<void> {
  const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  const client = new SESv2Client({
    region: process.env.SES_REGION || process.env.AWS_REGION,
    // No credentials in the environment means the SDK's default chain, which on
    // ECS finds the task role. That is the right way round on AWS: nothing
    // long-lived to leak or rotate.
    credentials:
      process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.SES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  await client.send(
    new SendEmailCommand({
      Content: { Raw: { Data: new Uint8Array(raw) } },
      // Set so bounces and complaints can be routed somewhere that acts on
      // them. An address that hard-bounces and nobody notices is a report
      // everyone believes was delivered.
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
    })
  );
}

async function sendViaSmtp(raw: Buffer, to: string): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; everything else negotiates STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  try {
    await transport.sendMail({ envelope: { from: envelopeFrom(), to }, raw });
  } finally {
    transport.close();
  }
}

function logInstead(mail: Mail, raw: Buffer): void {
  console.log(
    `[email:console] would send to ${mail.to} — ${JSON.stringify(mail.subject)}` +
      (mail.attachments?.length ? ` with ${mail.attachments.map((a) => a.filename).join(", ")}` : "") +
      ` (${raw.length} bytes)`
  );
}
