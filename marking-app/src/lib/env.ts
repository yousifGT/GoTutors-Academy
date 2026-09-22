/**
 * Configuration checks.
 *
 * A misconfigured deployment should announce itself rather than half-work, so
 * /api/health reports everything wrong at once — one deploy tells you the whole
 * story instead of one problem per attempt. Side-effect free on purpose.
 */

/** Values shipped in .env.example, which must never reach a running service. */
function looksLikePlaceholder(value: string): boolean {
  return /^REPLACE_WITH/i.test(value) || /\b(USER:PASS|HOST:5432|your-domain\.example)\b/.test(value);
}

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
  // A single-label host such as "placeholder" resolves nowhere.
  if (!LOCAL_HOSTS.has(url.hostname) && !url.hostname.includes(".")) {
    return `${name} host "${url.hostname}" is not a real hostname — it looks like a leftover placeholder.`;
  }
  if (value.endsWith("/")) return `${name} must not end with a trailing slash (got "${value}").`;
  return null;
}

/** Every configuration problem found. Empty means the configuration is usable. */
export function describeEnvProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) problems.push("DATABASE_URL is not set.");
  else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push("DATABASE_URL must be a postgresql:// connection string.");
  else if (looksLikePlaceholder(databaseUrl)) problems.push("DATABASE_URL is still the .env.example placeholder.");

  const secret = env.NEXTAUTH_SECRET?.trim();
  if (!secret) problems.push("NEXTAUTH_SECRET is not set — sessions cannot be signed.");
  else if (looksLikePlaceholder(secret))
    problems.push("NEXTAUTH_SECRET is still the .env.example placeholder — generate one with `openssl rand -hex 32`.");
  else if (secret.length < 32) problems.push(`NEXTAUTH_SECRET is only ${secret.length} characters; use at least 32.`);

  const authUrl = env.NEXTAUTH_URL?.trim();
  if (!authUrl) problems.push("NEXTAUTH_URL is not set — sign-in redirects will go to the wrong address.");
  else {
    const problem = describeUrlProblem("NEXTAUTH_URL", authUrl);
    if (problem) problems.push(problem);
    else if (looksLikePlaceholder(authUrl)) problems.push("NEXTAUTH_URL is still the .env.example placeholder.");
  }

  if (env.UPLOAD_BACKEND === "s3") {
    for (const key of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!env[key]?.trim()) problems.push(`UPLOAD_BACKEND is s3 but ${key} is not set.`);
    }
  }

  return problems;
}

/**
 * Reported separately from the problems above because it is not a broken
 * deployment: with no key the app still runs, and every paper goes to the
 * human queue. The UI says so rather than pretending marking is on.
 */
export function describeEnvWarnings(env: Record<string, string | undefined> = process.env): string[] {
  const warnings: string[] = [];
  if (!env.ANTHROPIC_API_KEY?.trim())
    warnings.push("ANTHROPIC_API_KEY is not set — automatic marking is off and every paper goes to the human queue.");
  if (env.NODE_ENV === "production" && env.UPLOAD_BACKEND !== "s3")
    warnings.push("UPLOAD_BACKEND is not s3 — paper uploads are refused in production, because local files do not survive a restart.");
  return warnings;
}
