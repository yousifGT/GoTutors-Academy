import { describe, it, expect, vi, afterEach } from "vitest";
import { sendFile, sendJson } from "./client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Records the request the helper actually made, which is what these test. */
function mockFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
  const seen: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.body ?? {},
    };
  }) as unknown as typeof fetch;
  return seen;
}

describe("sendJson", () => {
  it("always sends a JSON content-type", async () => {
    // The whole reason this helper exists: assertSameOrigin rejects a mutating
    // request without one, and a bare fetch(url, {method:"POST"}) sends none.
    const seen = mockFetch({});
    await sendJson("/api/thing");
    expect(seen[0].init.headers).toEqual({ "content-type": "application/json" });
  });

  it("sends an empty object rather than no body at all", async () => {
    const seen = mockFetch({});
    await sendJson("/api/thing");
    expect(seen[0].init.body).toBe("{}");
  });

  it("does the same for a DELETE, which usually has nothing to send", async () => {
    const seen = mockFetch({});
    await sendJson("/api/thing", "DELETE");
    expect(seen[0].init.method).toBe("DELETE");
    expect(seen[0].init.headers).toEqual({ "content-type": "application/json" });
  });

  it("returns the server's own message on a failure", async () => {
    mockFetch({ ok: false, status: 409, body: { error: "Already exists" } });
    const result = await sendJson("/api/thing");
    expect(result).toMatchObject({ ok: false, status: 409, error: "Already exists" });
  });

  it("still gives the caller the body on a failure, for the extra fields", async () => {
    mockFetch({ ok: false, status: 409, body: { error: "Taken", existingStudentId: "s1" } });
    const result = await sendJson<{ existingStudentId?: string }>("/api/thing");
    expect(result.ok).toBe(false);
    expect(result.data.existingStudentId).toBe("s1");
  });

  it("has something to show when the server sends no message", async () => {
    mockFetch({ ok: false, status: 500, body: {} });
    const result = await sendJson("/api/thing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("survives a response that is not JSON at all", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    })) as unknown as typeof fetch;
    const result = await sendJson("/api/thing");
    expect(result.ok).toBe(false);
  });
});

describe("sendFile", () => {
  it("sets no content-type, so the browser writes the multipart boundary", async () => {
    const seen = mockFetch({ body: { url: "/uploads/papers/x.png" } });
    await sendFile("/api/uploads/paper", new File(["x"], "x.png", { type: "image/png" }));
    expect(seen[0].init.headers).toBeUndefined();
    expect(seen[0].init.body).toBeInstanceOf(FormData);
  });

  it("returns the uploaded url", async () => {
    mockFetch({ body: { url: "/uploads/papers/x.png" } });
    const result = await sendFile("/api/uploads/paper", new File(["x"], "x.png", { type: "image/png" }));
    expect(result.ok && result.data.url).toBe("/uploads/papers/x.png");
  });
});
