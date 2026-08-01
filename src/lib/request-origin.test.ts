import { describe, it, expect } from "vitest";
import { canonicalHost, publicHost, publicOrigin, publicProtocol } from "./request-origin";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers: new Headers(headers) });
}

describe("canonicalHost", () => {
  it("strips default ports and lowercases", () => {
    expect(canonicalHost("Example.COM:443")).toBe("example.com");
    expect(canonicalHost("example.com:80")).toBe("example.com");
    expect(canonicalHost(" example.com ")).toBe("example.com");
  });

  it("keeps a non-default port, which is a different origin", () => {
    expect(canonicalHost("localhost:3000")).toBe("localhost:3000");
  });
});

describe("publicHost", () => {
  it("prefers x-forwarded-host over host", () => {
    expect(publicHost(req("http://10.0.0.5:3000/x", { host: "internal.lb", "x-forwarded-host": "lms.example.com" })))
      .toBe("lms.example.com");
  });

  it("falls back to the host header when the request URL is internal", () => {
    expect(publicHost(req("http://10.0.0.5:3000/x", { host: "lms.example.com" }))).toBe("lms.example.com");
  });

  it("falls back to the request URL with no proxy headers", () => {
    expect(publicHost(req("http://localhost:3000/x"))).toBe("localhost:3000");
  });

  it("uses only the first entry of a chained header", () => {
    expect(publicHost(req("http://10.0.0.5:3000/x", { "x-forwarded-host": "lms.example.com, internal:3000" })))
      .toBe("lms.example.com");
  });

  it("ignores an empty forwarded header rather than returning nothing", () => {
    expect(publicHost(req("http://localhost:3000/x", { "x-forwarded-host": "  " }))).toBe("localhost:3000");
  });
});

describe("publicProtocol", () => {
  it("trusts x-forwarded-proto, because TLS terminates at the load balancer", () => {
    expect(publicProtocol(req("http://10.0.0.5:3000/x", { "x-forwarded-proto": "https" }))).toBe("https");
  });

  it("uses the first entry of a chained header", () => {
    expect(publicProtocol(req("http://10.0.0.5:3000/x", { "x-forwarded-proto": "https, http" }))).toBe("https");
  });

  it("falls back to the request's own scheme", () => {
    expect(publicProtocol(req("http://localhost:3000/x"))).toBe("http");
  });
});

describe("publicOrigin", () => {
  it("reconstructs the address the browser used from behind a proxy", () => {
    const r = req("http://10.0.0.5:3000/api/x", {
      host: "lms.example.com",
      "x-forwarded-proto": "https",
    });
    expect(publicOrigin(r)).toBe("https://lms.example.com");
  });

  it("works unproxied in development", () => {
    expect(publicOrigin(req("http://localhost:3000/api/x"))).toBe("http://localhost:3000");
  });
});
