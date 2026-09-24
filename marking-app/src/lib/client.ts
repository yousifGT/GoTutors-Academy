/**
 * Every mutating request the browser makes goes through here.
 *
 * `assertSameOrigin` requires a JSON content-type on mutating requests as
 * defence-in-depth against HTML-form CSRF, and a bare
 * `fetch(url, { method: "POST" })` sends no content-type at all. That is a 415
 * the caller usually swallows — which is exactly what happened: the marking
 * call fired from the upload form and the retry button was rejected on every
 * press, the paper sat at "Not marked yet", and nothing in the UI said why.
 *
 * So the header is set in one place instead of at thirteen call sites, and a
 * body-less request sends `{}` rather than nothing.
 */

export type SendResult<T = Record<string, unknown>> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data: T };

export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
  body?: unknown
): Promise<SendResult<T>> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error ?? "Something went wrong.", data };
  }
  return { ok: true, status: res.status, data };
}

/** File uploads are multipart, which sets its own content-type. */
export async function sendFile(url: string, file: File): Promise<SendResult<{ url: string }>> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url: string; error?: string };
  if (!res.ok) return { ok: false, status: res.status, error: data.error ?? "That upload failed.", data };
  return { ok: true, status: res.status, data };
}
