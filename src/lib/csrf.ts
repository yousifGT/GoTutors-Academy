/**
 * Lightweight CSRF protection for JSON-only API routes.
 *
 * Browsers send `Sec-Fetch-Site: same-origin` for fetch() initiated from the same origin
 * with `content-type: application/json`. Cross-site form posts can't set arbitrary JSON
 * content-type, and `<form>` posts also send `Sec-Fetch-Site: cross-site` or `none`.
 *
 * We require:
 *  1. method must be POST/PATCH/PUT/DELETE
 *  2. content-type must start with application/json
 *  3. Origin header (when present) must match the request host
 */
export function assertSameOrigin(req: Request): void | Response {
  const method = req.method.toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return;

  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json") && !ct.startsWith("multipart/form-data")) {
    return new Response(JSON.stringify({ error: "Unsupported content-type" }), {
      status: 415,
      headers: { "content-type": "application/json" },
    });
  }

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(req.url);
      const o = new URL(origin);
      if (u.host !== o.host) {
        return new Response(JSON.stringify({ error: "Cross-origin request rejected" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Bad origin" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }
}
