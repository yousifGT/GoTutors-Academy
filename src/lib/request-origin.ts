/**
 * The address the *browser* used, as opposed to the address the server sees.
 *
 * Behind a load balancer these differ: the server's socket is an internal
 * address and port, while the browser addressed a public hostname over HTTPS.
 * Anything that reads the request URL directly — CSRF origin checks, absolute
 * redirects, links in emails, canonical URLs — is silently correct in local
 * development, where the two are identical, and silently wrong in production.
 *
 * Derive it here, in one place, so the whole app is right or wrong together
 * rather than case by case.
 */

/** `example.com` and `example.com:443` are the same host; compare them as such. */
export function canonicalHost(host: string): string {
  return host.trim().toLowerCase().replace(/:(80|443)$/, "");
}

/**
 * The hostname the browser addressed, from the proxy headers, falling back to
 * the request URL when there are none (direct connection, or a non-browser
 * client). Returns null only if nothing parseable is available.
 *
 * A proxy chain can append entries — "public.example, internal:3000" — so only
 * the first is meaningful.
 */
export function publicHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const first = forwarded?.split(",")[0];
  if (first?.trim()) return canonicalHost(first);
  try {
    return canonicalHost(new URL(req.url).host);
  } catch {
    return null;
  }
}

/**
 * Scheme the browser used. A load balancer terminating TLS forwards plain HTTP
 * to the container, so the request's own protocol says "http" even though the
 * user is on HTTPS — `x-forwarded-proto` is the only reliable signal.
 */
export function publicProtocol(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  try {
    return new URL(req.url).protocol.replace(/:$/, "");
  } catch {
    return "https";
  }
}

/** Full public origin, e.g. `https://lms.example.com`. Null if the host is unknown. */
export function publicOrigin(req: Request): string | null {
  const host = publicHost(req);
  if (!host) return null;
  return `${publicProtocol(req)}://${host}`;
}
