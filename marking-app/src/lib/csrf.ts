/**
 * CSRF protection for state-changing requests.
 *
 * `checkOrigin` runs in middleware on EVERY mutating /api request, so no route
 * can forget it. `assertSameOrigin` adds a required JSON/multipart content-type
 * for routes that only ever receive those, as defence-in-depth for the rare
 * case where an Origin header is absent.
 *
 * Browsers send Origin on all cross-site state-changing requests, so a host
 * mismatch reliably identifies forgery. A missing Origin means same-origin or a
 * non-browser client, which cannot be driven by a malicious page.
 */
import { canonicalHost, publicHost } from "@/lib/request-origin";

const MUTATING = ["POST", "PATCH", "PUT", "DELETE"];

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}

export function checkOrigin(req: Request): void | Response {
  if (!MUTATING.includes(req.method.toUpperCase())) return;

  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin or non-browser client

  const host = publicHost(req);
  if (!host) return jsonError(400, "Bad origin");

  try {
    if (canonicalHost(new URL(origin).host) !== host) return jsonError(403, "Cross-origin request rejected");
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
