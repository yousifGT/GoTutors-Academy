/**
 * In-memory sliding-window rate limiter. Safe for a single Node process.
 * For multi-instance deployments, replace the bucket store with Redis.
 */
const buckets = new Map<string, number[]>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, max: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= max) {
    const oldest = arr[0];
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowSec * 1000 - now) / 1000)) };
  }
  arr.push(now);
  buckets.set(key, arr);
  // periodic GC
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.length === 0 || v[v.length - 1] < cutoff) buckets.delete(k);
  }
  return { ok: true };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function tooMany(retryAfterSec: number) {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}
