/**
 * Runtime configuration checks.
 *
 * A misconfigured deployment should announce itself, not half-work. Shipping
 * with `NEXTAUTH_URL=http://placeholder` left sessions redirecting to a
 * hostname that does not exist, and nothing anywhere said so — the container
 * started, the health check passed, and the failure surfaced much later as a
 * confusing login problem.
 *
 * `describeEnvProblems` returns everything wrong at once so one deploy tells you
 * the whole story rather than one problem per attempt. It is deliberately
 * side-effect free: the health endpoint reports it, so a bad config shows up as
 * an unhealthy task (and an automatic rollback) instead of a crash loop that is
 * harder to read.
 *
 * Checks run against the values in `process.env` at call time, and only cover
 * settings whose absence or obvious wrongness breaks the app. Anything optional
 * (S3, rate-limit tuning) is left alone.
 */

/** Hosts that are legitimate without a dot — everything else needs one. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function describeUrlProblem(name: string, value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${name} is not a valid absolute URL (got "${value}").`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `${name} must be http or https (got "${url.protocol.replace(/:$/, "")}").`;
  }
  // A single-label host such as "placeholder" resolves nowhere. Real deployments
  // use a dotted name; local development uses one of the loopback names above.
  if (!LOCAL_HOSTS.has(url.hostname) && !url.hostname.includes(".")) {
    return `${name} host "${url.hostname}" is not a real hostname — it looks like a leftover placeholder.`;
  }
  if (value.endsWith("/")) {
    return `${name} must not end with a trailing slash (got "${value}").`;
  }
  return null;
}

/**
 * Every configuration problem found, as human-readable sentences. Empty means
 * the configuration is usable.
 */
export function describeEnvProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push("DATABASE_URL must be a postgresql:// connection string.");
  }

  const secret = env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    problems.push("NEXTAUTH_SECRET is not set — sessions cannot be signed.");
  } else if (secret.length < 32) {
    problems.push(`NEXTAUTH_SECRET is only ${secret.length} characters; use at least 32 (openssl rand -hex 32).`);
  }

  const authUrl = env.NEXTAUTH_URL?.trim();
  if (!authUrl) {
    problems.push("NEXTAUTH_URL is not set — sign-in redirects will go to the wrong address.");
  } else {
    const problem = describeUrlProblem("NEXTAUTH_URL", authUrl);
    if (problem) problems.push(problem);
  }

  const window = env.RATE_LIMIT_WINDOW_SEC?.trim();
  if (window && !/^\d+$/.test(window)) {
    problems.push(`RATE_LIMIT_WINDOW_SEC must be a whole number of seconds (got "${window}").`);
  }

  if (env.UPLOAD_BACKEND === "s3") {
    for (const key of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!env[key]?.trim()) problems.push(`UPLOAD_BACKEND is s3 but ${key} is not set.`);
    }
  }

  return problems;
}
