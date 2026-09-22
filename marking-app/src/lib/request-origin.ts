/**
 * The hostname the browser actually used.
 *
 * Behind a load balancer `req.url` is the container's internal address, so a
 * same-origin check against it rejects every legitimate request. The forwarded
 * headers are what the browser sent.
 */
export function publicHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host");
  const host = forwarded?.split(",")[0].trim() || req.headers.get("host");
  return host ? canonicalHost(host) : null;
}

/** Lowercased, with the default port for the scheme dropped. */
export function canonicalHost(host: string): string {
  return host.trim().toLowerCase().replace(/:(80|443)$/, "");
}
