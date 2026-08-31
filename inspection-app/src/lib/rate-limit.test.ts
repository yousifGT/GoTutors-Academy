import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clientIp, tooMany } from "@/lib/rate-limit";

const headers = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe("whose address is it", () => {
  it("reads the entry the proxy wrote, counting from the right", () => {
    // A load balancer APPENDS what it saw; it does not replace what arrived. So
    // with one proxy in front, the trustworthy entry is the last one.
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIp(headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });

  it("ignores what the caller put in front of it", () => {
    // This is the whole point. Reading the FIRST entry — the obvious thing to
    // do — reads a value the caller chose, so a per-address limit keyed on it
    // is defeated by sending a different fake address each time.
    const spoofed = headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.4" });
    expect(clientIp(spoofed, 1)).toBe("198.51.100.4");
    expect(clientIp(spoofed, 1)).not.toBe("1.1.1.1");
  });

  it("counts back further when something sits in front of the load balancer", () => {
    // CloudFront in front of an ALB: the ALB appends the CloudFront address,
    // and the entry before it is the real client.
    expect(clientIp(headers({ "x-forwarded-for": "198.51.100.4, 70.0.0.1" }), 2)).toBe("198.51.100.4");
  });

  it("does not index off the front when the header is shorter than expected", () => {
    // Fewer entries than proxies means the header did not come from where we
    // think it did. Take the leftmost rather than reading past the start.
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
  });

  it("tolerates whitespace and empty entries", () => {
    expect(clientIp(headers({ "x-forwarded-for": " 10.0.0.1 ,  , 203.0.113.9 " }), 1)).toBe("203.0.113.9");
  });

  it("falls back, and never returns nothing", () => {
    expect(clientIp(headers({ "x-real-ip": "203.0.113.7" }), 1)).toBe("203.0.113.7");
    expect(clientIp(headers({}), 1)).toBe("unknown");
    expect(clientIp(headers({ "x-forwarded-for": "" }), 1)).toBe("unknown");
  });
});

describe("the 429 it hands back", () => {
  it("tells the caller when to come back", () => {
    const res = tooMany(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });
});

describe("counting in the database", () => {
  const db = { rateLimit: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn() };
  vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: (_t, k) => (globalThis as never as { __db: Record<string, unknown> }).__db[k as string] }) }));
  beforeEach(() => {
    (globalThis as never as { __db: unknown }).__db = db;
    db.rateLimit.deleteMany.mockResolvedValue({ count: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("allows under the limit and refuses over it", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    db.$transaction.mockResolvedValueOnce([null, { count: 3 }]);
    expect(await rateLimit("k", 5, 60)).toEqual({ ok: true });

    db.$transaction.mockResolvedValueOnce([null, { count: 6 }]);
    const denied = await rateLimit("k", 5, 60);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("carries the previous window forward, so a boundary is not a free reset", async () => {
    // A fixed window lets twice the limit through either side of the boundary:
    // spend the whole allowance at the end of one and the whole of it again a
    // second later in the next. The previous window has to keep counting for
    // however much of it is still in view.
    const { rateLimit } = await import("@/lib/rate-limit");
    vi.useFakeTimers();
    try {
      // Six seconds into a sixty-second window: 90% of the last one still counts.
      vi.setSystemTime(new Date(1_000_000 * 60_000 + 6_000));
      db.$transaction.mockResolvedValueOnce([{ count: 5 }, { count: 1 }]);
      expect((await rateLimit("k", 5, 60)).ok).toBe(false); // 5 * 0.9 + 1 = 5.5

      // Fifty-four seconds in, only 10% of it does, and the same counts pass.
      vi.setSystemTime(new Date(1_000_000 * 60_000 + 54_000));
      db.$transaction.mockResolvedValueOnce([{ count: 5 }, { count: 1 }]);
      expect((await rateLimit("k", 5, 60)).ok).toBe(true); // 5 * 0.1 + 1 = 1.5
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets a key, so a success can clear what failures counted", async () => {
    // Only failures are worth counting: the limit exists to slow guessing, and
    // someone who signed in is not guessing. Counting successes too would lock
    // out an office where a dozen people arrive at once behind one address.
    const { forget } = await import("@/lib/rate-limit");
    await forget("signin:ip:203.0.113.9", 60);
    expect(db.rateLimit.deleteMany).toHaveBeenCalled();
    const where = db.rateLimit.deleteMany.mock.calls.at(-1)[0].where;
    // Both the current window and the previous one, or the one still in view
    // keeps counting against them.
    expect(where.key.in).toHaveLength(2);
    expect(where.key.in.every((k: string) => k.startsWith("signin:ip:203.0.113.9|"))).toBe(true);
  });

  it("lets the request through when the database cannot answer", async () => {
    // Open on purpose. Everything this protects needs the database for its real
    // work, so a database that cannot count cannot serve the request either —
    // failing closed would make the limiter its own outage.
    const { rateLimit } = await import("@/lib/rate-limit");
    db.$transaction.mockRejectedValueOnce(new Error("connection terminated"));
    expect(await rateLimit("k", 5, 60)).toEqual({ ok: true });
  });
});
