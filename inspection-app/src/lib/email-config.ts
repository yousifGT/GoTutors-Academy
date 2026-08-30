/**
 * Which mail backend is configured, and what it is missing.
 *
 * Separate from `email.ts` so that reading the configuration does not drag in
 * the mail library. The boot check imports this, and the boot check is bundled
 * for the Edge runtime as well as Node — where nodemailer's `stream` and
 * `crypto` do not exist, and the build fails outright.
 */

export type EmailBackend = "ses" | "smtp" | "console";

export function emailBackend(env: NodeJS.ProcessEnv = process.env): EmailBackend {
  const raw = env.EMAIL_BACKEND;
  return raw === "ses" || raw === "smtp" ? raw : "console";
}

/** Settings this backend needs that are not set. For the boot check. */
export function emailConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const backend = emailBackend(env);
  const missing: string[] = [];
  if (backend === "console") return missing;
  if (!env.EMAIL_FROM) missing.push("EMAIL_FROM");
  if (backend === "ses" && !env.SES_REGION && !env.AWS_REGION) missing.push("SES_REGION");
  if (backend === "smtp") {
    if (!env.SMTP_HOST) missing.push("SMTP_HOST");
    // User and password go together: one without the other is a typo, and
    // neither is a legitimate configuration for a relay on a private network.
    if (!!env.SMTP_USER !== !!env.SMTP_PASSWORD) missing.push("SMTP_USER/SMTP_PASSWORD");
  }
  return missing;
}

export function emailFrom(env: NodeJS.ProcessEnv = process.env): string {
  return env.EMAIL_FROM || "GoTutors Inspections <inspections@localhost>";
}

/** The bare address out of a "Name <addr>" from-line, for the SMTP envelope. */
export function envelopeFrom(env: NodeJS.ProcessEnv = process.env): string {
  const from = emailFrom(env);
  const angled = from.match(/<([^>]+)>/);
  return angled ? angled[1] : from;
}
