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

/**
 * What the mail configuration is, in a form safe to put on a screen.
 *
 * Deliberately never the password. Everything else is worth showing, because
 * the commonest email problem is not a bug but a setting — the wrong port, a
 * From address on a domain nobody verified, or a backend still on `console`
 * with everybody wondering where the reports went.
 */
export interface EmailSettings {
  backend: EmailBackend;
  from: string;
  replyTo: string | null;
  host: string | null;
  port: number | null;
  /** Implicit TLS on 465; STARTTLS on everything else. */
  tls: "implicit" | "starttls" | null;
  user: string | null;
  /** Whether a password is set — never what it is. */
  hasPassword: boolean;
  region: string | null;
  missing: string[];
}

export function emailSettings(env: NodeJS.ProcessEnv = process.env): EmailSettings {
  const backend = emailBackend(env);
  const port = backend === "smtp" ? Number(env.SMTP_PORT) || 587 : null;
  return {
    backend,
    from: emailFrom(env),
    replyTo: env.EMAIL_REPLY_TO || null,
    host: backend === "smtp" ? (env.SMTP_HOST ?? null) : null,
    port,
    tls: port === null ? null : port === 465 ? "implicit" : "starttls",
    user: backend === "smtp" ? (env.SMTP_USER ?? null) : null,
    hasPassword: !!env.SMTP_PASSWORD,
    region: backend === "ses" ? (env.SES_REGION ?? env.AWS_REGION ?? null) : null,
    missing: emailConfigProblems(env),
  };
}
