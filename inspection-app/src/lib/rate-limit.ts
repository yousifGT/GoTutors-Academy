import { prisma } from "@/lib/prisma";

/**
 * Rate limiting, counted in the database so every instance sees the same tally.
 *
 * This used to be a Map in the process. That is correct on one machine and
 * wrong everywhere else: behind a load balancer each task keeps its own count,
 * so five sign-in attempts a minute becomes five per task per minute, and an
 * attacker gets the whole limit again by being routed somewhere else. A limit
 * that a second machine cancels is not a limit.
 *
 * The algorithm is a sliding-window counter. A fixed window lets twice the
 * limit through either side of a boundary; a log of every hit is a row per
 * request. This keeps one row per window and weights the previous window by how
 * much of it is still in view, which is accurate enough and costs one round
 * trip.
 *
 * Denied requests are counted too. Someone hammering the endpoint stays over
 * the line for as long as they keep hammering, which for a sign-in limiter is
 * the behaviour you want.
 */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Failures are opened, not closed — see `rateLimit`. */
const ALLOW: RateLimitResult = { ok: true };

export async function rateLimit(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const window = windowSec * 1000;
  const bucket = Math.floor(nowMs / window);
  const elapsed = (nowMs % window) / window;

  try {
    const [previous, current] = await prisma.$transaction([
      prisma.rateLimit.findUnique({ where: { key: `${key}|${bucket - 1}` }, select: { count: true } }),
      prisma.rateLimit.upsert({
        where: { key: `${key}|${bucket}` },
        create: { key: `${key}|${bucket}`, count: 1, expiresAt: new Date((bucket + 2) * window) },
        update: { count: { increment: 1 } },
        select: { count: true },
      }),
    ]);

    // The previous window still counts for the part of it that has not yet
    // slid out of view.
    const estimate = (previous?.count ?? 0) * (1 - elapsed) + current.count;
    if (estimate > max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - elapsed) * windowSec)) };

    await sweepOccasionally(nowMs);
    return ALLOW;
  } catch (e) {
    // Open, deliberately. Everything this protects needs the database for its
    // real work — a sign-in reads the user, an upload writes a row — so a
    // database that cannot count is a database that cannot serve the request
    // either. Failing closed here would turn one outage into two and make the
    // limiter its own denial of service.
    console.error("rate limit unavailable, allowing request", { key, err: e });
    return ALLOW;
  }
}

/**
 * Expired buckets, cleared out from whichever instance gets there first.
 *
 * Once a minute per process rather than on every request: the rows are tiny and
 * indexed by expiry, and there is no need for a scheduled job to exist for
 * something the app can tidy after itself.
 */
let lastSweep = 0;
async function sweepOccasionally(nowMs: number): Promise<void> {
  if (nowMs - lastSweep < 60_000) return;
  lastSweep = nowMs;
  await prisma.rateLimit
    .deleteMany({ where: { expiresAt: { lt: new Date(nowMs) } } })
    .catch((e) => console.error("rate limit sweep failed", e));
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * `X-Forwarded-For` is a list, and a client can put anything it likes at the
 * front of it — a load balancer appends what it saw, it does not replace what
 * arrived. So the trustworthy entry is counted from the RIGHT: with one proxy
 * in front of the app, the last entry is the one the proxy wrote; with
 * CloudFront in front of an ALB it is the second from last. Reading the first
 * entry, which is the obvious thing to do, reads a value the caller chose, and
 * a per-address limit keyed on it stops nobody.
 */
export function clientIp(req: { headers: Headers }, trustedHops = trustedProxyHops()): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // Fewer entries than proxies means the header did not come from where we
    // think it did; take the leftmost rather than index off the front of it.
    const at = hops.length - Math.max(1, trustedHops);
    const ip = hops[at >= 0 ? at : 0];
    if (ip) return ip;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

function trustedProxyHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return 1;
}

export function tooMany(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}
