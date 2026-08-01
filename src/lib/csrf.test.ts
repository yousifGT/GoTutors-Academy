import { describe, it, expect } from "vitest";
import { assertSameOrigin, checkOrigin } from "./csrf";

function makeReq(opts: {
  method?: string;
  contentType?: string;
  origin?: string;
  url?: string;
  host?: string;
  forwardedHost?: string;
}) {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.host) headers.set("host", opts.host);
  if (opts.forwardedHost) headers.set("x-forwarded-host", opts.forwardedHost);
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

describe("checkOrigin (middleware layer)", () => {
  it("rejects cross-origin mutations", () => {
    const r = checkOrigin(
      makeReq({ method: "DELETE", origin: "https://evil.example", url: "https://app.test/api/x" })
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });

  it("allows same-origin mutations", () => {
    const r = checkOrigin(
      makeReq({ method: "DELETE", origin: "https://app.test", url: "https://app.test/api/x" })
    );
    expect(r).toBeUndefined();
  });

  it("allows mutations with no content-type (no body)", () => {
    const r = checkOrigin(
      makeReq({ method: "POST", origin: "https://app.test", url: "https://app.test/api/x" })
    );
    expect(r).toBeUndefined();
  });

  it("allows requests with no Origin header (same-origin / non-browser)", () => {
    const r = checkOrigin(makeReq({ method: "DELETE", url: "https://app.test/api/x" }));
    expect(r).toBeUndefined();
  });

  it("ignores GET requests", () => {
    const r = checkOrigin(makeReq({ method: "GET", origin: "https://evil.example" }));
    expect(r).toBeUndefined();
  });
});

// Behind a load balancer the server sees an internal request URL while the
// browser addressed the public hostname. Comparing Origin against the request
// URL rejected every legitimate mutation in that setup.
describe("checkOrigin behind a proxy", () => {
  it("allows a same-origin mutation when the request URL is the internal address", () => {
    const r = checkOrigin(
      makeReq({
        method: "POST",
        origin: "https://app.test",
        host: "app.test",
        url: "http://10.0.1.23:3000/api/users",
      })
    );
    expect(r).toBeUndefined();
  });

  it("still rejects a cross-origin mutation behind the proxy", () => {
    const r = checkOrigin(
      makeReq({
        method: "POST",
        origin: "https://evil.example",
        host: "app.test",
        url: "http://10.0.1.23:3000/api/users",
      })
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });

  it("prefers x-forwarded-host over host when a proxy rewrote it", () => {
    const r = checkOrigin(
      makeReq({
        method: "POST",
        origin: "https://app.test",
        forwardedHost: "app.test",
        host: "internal.lb.local",
        url: "http://10.0.1.23:3000/api/users",
      })
    );
    expect(r).toBeUndefined();
  });

  it("uses only the first entry of a chained x-forwarded-host", () => {
    const r = checkOrigin(
      makeReq({
        method: "POST",
        origin: "https://app.test",
        forwardedHost: "app.test, internal:3000",
        url: "http://10.0.1.23:3000/api/users",
      })
    );
    expect(r).toBeUndefined();
  });

  it("treats an explicit default port as equal to none", () => {
    const r = checkOrigin(
      makeReq({ method: "POST", origin: "https://app.test", host: "app.test:443", url: "http://10.0.1.23:3000/api/x" })
    );
    expect(r).toBeUndefined();
  });

  it("still distinguishes a genuinely different port", () => {
    const r = checkOrigin(
      makeReq({ method: "POST", origin: "http://localhost:5555", host: "localhost:3000", url: "http://localhost:3000/api/x" })
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });
});
