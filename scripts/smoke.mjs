/**
 * Post-deploy smoke test: prove a deployment actually works, against the real URL.
 *
 *   npm run smoke -- https://lms.example.com
 *   npm run smoke                      # defaults to http://localhost:3000
 *
 * Two production bugs shipped unnoticed because "the service is running" was
 * taken as "the service works": the container could not reach its database (the
 * health check only rendered a static page) and every mutating API request was
 * rejected as cross-origin (nobody tried creating anything until the next day).
 * Both are caught below in a few seconds.
 *
 * Read-only and unauthenticated by design — safe to run against production as
 * often as you like. It never signs in and never writes, so it can't disturb
 * real data; what it checks is that the pipes are connected.
 *
 * No dependencies: Node 20+ has fetch built in.
 */

const baseUrl = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

let failures = 0;

function pass(name, detail) {
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  failures++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, { redirect: "manual", signal: controller.signal, ...init });
    const body = await res.text();
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

/** The database is reachable and the configuration is usable. */
async function checkHealth() {
  const name = "health endpoint reports ok";
  try {
    const { res, body } = await request("/api/health");
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return fail(name, `HTTP ${res.status}, response was not JSON — is /api/health deployed?`);
    }
    const checks = Object.entries(parsed.checks ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (res.status === 200 && parsed.status === "ok") return pass(name, checks);
    fail(name, `HTTP ${res.status}, status=${parsed.status}, ${checks}`);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

/** The login page renders — the app is serving, TLS works, the host routes. */
async function checkLoginPage() {
  const name = "login page renders";
  try {
    const { res, body } = await request("/login");
    if (res.status !== 200) return fail(name, `HTTP ${res.status}`);
    if (!/password/i.test(body)) return fail(name, "200 but the page has no password field");
    pass(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

/**
 * A mutating request reaches the route's own auth check instead of being
 * rejected by the CSRF middleware. 401 is the pass: the request got through the
 * middleware and was refused for having no session, which is correct. A 403
 * "cross-origin" means the origin check is misconfigured for this deployment and
 * nobody can create or edit anything.
 */
async function checkMutationsReachTheApp() {
  const name = "mutating requests pass the origin check";
  try {
    const { res, body } = await request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({}),
    });
    if (res.status === 401) return pass(name, "401 unauthenticated, as expected");
    if (res.status === 403 && /cross-origin/i.test(body)) {
      return fail(name, "403 cross-origin rejected — the app cannot write anything in this deployment");
    }
    fail(name, `unexpected HTTP ${res.status}: ${body.slice(0, 120)}`);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

/** Redirects should keep users on the public hostname, not an internal address. */
async function checkRedirectsStayOnPublicHost() {
  const name = "protected page redirects to this host";
  try {
    const { res } = await request("/admin");
    if (res.status < 300 || res.status >= 400) return pass(name, `no redirect (HTTP ${res.status})`);
    const location = res.headers.get("location") ?? "";
    if (!/^https?:\/\//.test(location)) return pass(name, `relative redirect (${location})`);
    const target = new URL(location).host;
    const expected = new URL(baseUrl).host;
    if (target === expected) return pass(name, `-> ${target}`);
    fail(name, `redirects to ${target}, expected ${expected} — check NEXTAUTH_URL`);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

console.log(`Smoke testing ${baseUrl}`);
await checkHealth();
await checkLoginPage();
await checkMutationsReachTheApp();
await checkRedirectsStayOnPublicHost();

if (failures) {
  console.log(`\n${failures} check${failures === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
