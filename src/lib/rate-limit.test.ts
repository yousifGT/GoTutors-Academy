import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to max calls", () => {
    const key = "test:allow:" + Math.random();
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(key, 3, 60);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects the (max+1)th call with retryAfter", () => {
    const key = "test:reject:" + Math.random();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60);
    const r = rateLimit(key, 3, 60);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterSec).toBeGreaterThan(0);
      expect(r.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("buckets are scoped by key", () => {
    const a = "test:a:" + Math.random();
    const b = "test:b:" + Math.random();
    for (let i = 0; i < 5; i++) rateLimit(a, 5, 60);
    expect(rateLimit(a, 5, 60).ok).toBe(false);
    expect(rateLimit(b, 5, 60).ok).toBe(true);
  });
});
