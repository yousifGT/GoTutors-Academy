/**
 * CSRF protection for state-changing API requests.
 *
 * Two layers:
 *  - `checkOrigin` runs in middleware (`src/middleware.ts`) on EVERY mutating
 *    `/api` request. It rejects requests whose `Origin` header doesn't match the
 *    request host. This is the primary, uniform defense — no route can forget it.
 *  - `assertSameOrigin` additionally requires an `application/json` (or
 *    `multipart/form-data`) content-type. Used by routes that only ever receive
 *    JSON/multipart bodies, as defense-in-depth against HTML-form CSRF in the
 *    (rare) case where an `Origin` header is absent.
 *
 * Browsers send `Origin` on all cross-site state-changing requests (fetch and
 * `<form>` posts alike), so a host mismatch reliably identifies cross-site
 * forgery. A missing `Origin` means same-origin or a non-browser client, which
 * we allow — those can't be driven by a malicious page.
 */

const MUTATING = ["POST", "PATCH", "PUT", "DELETE"];

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `example.com` and `example.com:443` are the same host; compare them as such. */
function canonicalHost(host: string): string {
  return host.trim().toLowerCase().replace(/:(80|443)$/, "");
}

/**
 * The host the browser actually addressed.
 *
 * Behind a load balancer the request URL the server sees is the internal one
 * (container address and port), not the address the browser used — so comparing
 * `Origin` against it rejects every legitimate request once the app is deployed
 * behind a proxy, while passing locally where the two are identical. The
 * browser's host survives in `host` (preserved by the load balancer) or
 * `x-forwarded-host` (set by proxies that rewrite it), so prefer those.
 *
 * Trusting these headers is sound for CSRF specifically: the attack is a
 * victim's browser being driven by a malicious page, and that browser sets
 * `host` to this app's real hostname while `Origin` stays the attacker's — the
 * mismatch we want. A non-browser client can forge both headers, but it can
 * already make any request it likes without needing a victim, so there is
 * nothing extra to defend against there.
 */
function requestHost(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  // A proxy chain can append, producing "public.example, internal:3000".
  const first = forwarded?.split(",")[0];
  if (first?.trim()) return canonicalHost(first);
  try {
    return canonicalHost(new URL(req.url).host);
  } catch {
    return null;
  }
}

/** Reject mutating requests whose `Origin` header doesn't match the host. */
export function checkOrigin(req: Request): void | Response {
  if (!MUTATING.includes(req.method.toUpperCase())) return;

  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin or non-browser client

  const host = requestHost(req);
  if (!host) return jsonError(400, "Bad origin");

  try {
    if (canonicalHost(new URL(origin).host) !== host) {
      return jsonError(403, "Cross-origin request rejected");
    }
  } catch {
    return jsonError(400, "Bad origin");
  }
}

/** `checkOrigin` plus a required JSON/multipart content-type. */
export function assertSameOrigin(req: Request): void | Response {
  if (!MUTATING.includes(req.method.toUpperCase())) return;

  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json") && !ct.startsWith("multipart/form-data")) {
    return jsonError(415, "Unsupported content-type");
  }

  return checkOrigin(req);
}
