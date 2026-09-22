/**
 * In-memory sliding-window rate limiter. Correct for a single Node process.
 * Running more than one container means replacing the bucket store with Redis —
 * until then the limits are per container, not per user.
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
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.length === 0 || v[v.length - 1] < cutoff) buckets.delete(k);
  }
  return { ok: true };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function tooMany(retryAfterSec: number) {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}
