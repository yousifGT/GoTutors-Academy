import { describe, it, expect } from "vitest";
import { hashToken, newToken, resetUrl, RESET_TTL_MIN } from "@/lib/password-reset";

describe("reset tokens", () => {
  it("are long and unguessable", () => {
    const { token } = newToken();
    // 32 random bytes, base64url — no padding, nothing that needs escaping in a
    // URL, and far past the point where guessing is a strategy.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new Set(Array.from({ length: 50 }, () => newToken().token)).size).toBe(50);
  });

  it("are stored only as a hash", () => {
    // A copy of the table — a backup, a leaked dump, read access for support —
    // must not be a set of working links into people's accounts.
    const { token, tokenHash } = newToken();
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashToken(token)).toBe(tokenHash);
    expect(hashToken(token + "x")).not.toBe(tokenHash);
  });

  it("build a link the app can read back", () => {
    const url = resetUrl("abc-123_XY", "https://inspections.gotutors.com/");
    expect(url).toBe("https://inspections.gotutors.com/reset?token=abc-123_XY");
  });

  it("escapes anything that would break the link", () => {
    expect(resetUrl("a+b/c=", "https://x.test")).toBe("https://x.test/reset?token=a%2Bb%2Fc%3D");
  });

  it("expires within the hour", () => {
    expect(RESET_TTL_MIN).toBeLessThanOrEqual(60);
  });
});
