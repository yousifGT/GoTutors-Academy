/**
 * Everything this app reads from its environment, checked in one place.
 *
 * The failure this exists to prevent: a container that starts, passes its
 * health check, accepts traffic, and only then discovers that a variable is
 * missing — one request at a time, in production, to whoever happened to be
 * using it. Configuration is either right at boot or the process should not be
 * serving.
 *
 * `problems()` returns everything wrong at once. Reporting the first fault and
 * stopping means an operator fixes one variable, redeploys, waits, and finds
 * the next — so the list is always complete.
 */

export type Severity = "fatal" | "warning";

export interface Problem {
  key: string;
  severity: Severity;
  message: string;
}

/** The build-time value baked into the Dockerfile so `next build` can run. */
const BUILD_PLACEHOLDER = "build-time-placeholder";

/**
 * Whether this process is actually deployed somewhere, as opposed to running a
 * production build on someone's machine.
 *
 * NODE_ENV cannot answer this: `next start` sets it to "production"
 * unconditionally, so it is also what you get building the app and running it
 * locally — which is how the browser tests run. Keying the strict checks on it
 * makes the app refuse to start on a laptop.
 *
 * NEXTAUTH_URL can answer it, and needs no new variable that someone could
 * forget to set: it is required either way, every deployment has a real host in
 * it, and no deployment has localhost. Anything that is not plainly local gets
 * the strict treatment, so the failure is on the safe side.
 */
export function isDeployed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  const url = env.NEXTAUTH_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return !(host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".localhost"));
  } catch {
    return true; // unparseable: assume deployed and let the checks below complain
  }
}

/**
 * Everything wrong with the current environment.
 *
 * A `fatal` means the process must not serve traffic. A `warning` means it will
 * work but something is set up in a way that will bite later — and is loud in
 * the logs rather than silent.
 */
export function problems(env: NodeJS.ProcessEnv = process.env): Problem[] {
  const out: Problem[] = [];
  const deployed = isDeployed(env);
  const fatal = (key: string, message: string) => out.push({ key, severity: "fatal", message });
  const warn = (key: string, message: string) => out.push({ key, severity: "warning", message });

  // --- the three the app cannot run without -------------------------------
  if (!env.DATABASE_URL) fatal("DATABASE_URL", "not set — the app has no database to talk to");
  else if (deployed && env.DATABASE_URL.includes("localhost"))
    warn("DATABASE_URL", "points at localhost in production; is this really the deployed database?");

  const secret = env.NEXTAUTH_SECRET;
  if (!secret) fatal("NEXTAUTH_SECRET", "not set — session tokens cannot be signed");
  else if (secret.includes(BUILD_PLACEHOLDER))
    // The Dockerfile sets this so `next build` runs. If it survives into a
    // running container, every session token is signed with a value that is
    // committed to this repository and readable by anyone.
    fatal("NEXTAUTH_SECRET", "still the placeholder from the Docker build; session tokens would be forgeable");
  else if (secret.length < 32)
    fatal("NEXTAUTH_SECRET", `only ${secret.length} characters; use at least 32 (openssl rand -hex 32)`);

  const url = env.NEXTAUTH_URL;
  if (!url) fatal("NEXTAUTH_URL", "not set — sign-in redirects and callbacks have no origin to use");
  else if (deployed && url.startsWith("http://"))
    // Session cookies are only marked Secure when the URL says https, so this
    // is not cosmetic: over http the cookie travels in the clear.
    fatal("NEXTAUTH_URL", "must be https in production, or session cookies are sent unencrypted");

  // --- where photographs go -----------------------------------------------
  const backend = env.UPLOAD_BACKEND;
  if (backend === "s3") {
    for (const key of ["S3_BUCKET", "S3_REGION"]) {
      if (!env[key]) fatal(key, "required when UPLOAD_BACKEND=s3");
    }
    const oneKey = !!env.S3_ACCESS_KEY_ID !== !!env.S3_SECRET_ACCESS_KEY;
    if (oneKey)
      fatal(
        "S3_ACCESS_KEY_ID",
        "set one of S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY without the other; set both, or neither to use the task role"
      );
  } else if (deployed && env.ALLOW_LOCAL_UPLOADS !== "1") {
    // Local disk in production means photographs are wiped by the next
    // redeploy, and two tasks cannot see each other's. Deliberate single-box
    // installs can say so; nobody should reach that state by omission.
    fatal(
      "UPLOAD_BACKEND",
      "not set to s3: photographs would be written to a container filesystem that does not survive a redeploy. " +
        "Set UPLOAD_BACKEND=s3, or ALLOW_LOCAL_UPLOADS=1 if this really is one machine with a persistent volume"
    );
  } else if (backend && backend !== "s3") {
    warn("UPLOAD_BACKEND", `unrecognised value ${JSON.stringify(backend)}; falling back to local disk`);
  }

  // --- seeding -------------------------------------------------------------
  if (env.SEED_ADMIN_EMAIL && !env.SEED_ADMIN_PASSWORD)
    warn("SEED_ADMIN_PASSWORD", "SEED_ADMIN_EMAIL is set without it, so the seed will not create an account");

  return out;
}

export function fatals(env: NodeJS.ProcessEnv = process.env): Problem[] {
  return problems(env).filter((p) => p.severity === "fatal");
}

/** One block of text an operator can act on without reading the source. */
export function describe(found: Problem[]): string {
  if (!found.length) return "Configuration OK.";
  const line = (p: Problem) => `  ${p.severity === "fatal" ? "FATAL" : " WARN"}  ${p.key}: ${p.message}`;
  return [
    "",
    "──────────────────────────────────────────────────────────────",
    " GoTutors inspection app — configuration",
    "──────────────────────────────────────────────────────────────",
    ...found.map(line),
    "──────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}
