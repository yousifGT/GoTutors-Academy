import { describe, it, expect } from "vitest";
import { assertSameOrigin } from "./csrf";

function makeReq(opts: { method?: string; contentType?: string; origin?: string; url?: string }) {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  if (opts.origin) headers.set("origin", opts.origin);
  const method = (opts.method ?? "POST").toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") init.body = "{}";
  return new Request(opts.url ?? "https://app.test/api/x", init);
}

describe("assertSameOrigin", () => {
  it("passes for same-origin JSON POST", () => {
    const res = assertSameOrigin(
      makeReq({ contentType: "application/json", origin: "https://app.test", url: "https://app.test/api/x" })
    );
    expect(res).toBeUndefined();
  });

  it("rejects form-encoded POST as unsupported content-type", () => {
    const r = assertSameOrigin(
      makeReq({ contentType: "application/x-www-form-urlencoded", origin: "https://app.test" })
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(415);
  });

  it("rejects cross-origin requests", () => {
    const r = assertSameOrigin(
      makeReq({ contentType: "application/json", origin: "https://evil.example", url: "https://app.test/api/x" })
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });

  it("ignores GET requests", () => {
    const r = assertSameOrigin(makeReq({ method: "GET" }));
    expect(r).toBeUndefined();
  });

  it("allows multipart uploads", () => {
    const r = assertSameOrigin(
      makeReq({ contentType: "multipart/form-data; boundary=x", origin: "https://app.test", url: "https://app.test/api/x" })
    );
    expect(r).toBeUndefined();
  });
});
