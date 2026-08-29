import { describe, it, expect } from "vitest";
import { isSelfLockout, passwordProblem } from "./user-rules";

describe("isSelfLockout", () => {
  it("stops you deactivating yourself", () => {
    expect(isSelfLockout("u1", "u1", { active: false })).toBe(true);
  });

  it("stops you demoting yourself out of super admin", () => {
    expect(isSelfLockout("u1", "u1", { role: "INSPECTOR" })).toBe(true);
  });

  it("allows other edits to your own account", () => {
    expect(isSelfLockout("u1", "u1", { active: true })).toBe(false);
    expect(isSelfLockout("u1", "u1", { role: "SUPER_ADMIN" })).toBe(false);
    expect(isSelfLockout("u1", "u1", {})).toBe(false);
  });

  it("does not restrict edits to other people", () => {
    expect(isSelfLockout("u1", "u2", { active: false, role: "INSPECTOR" })).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("wants length above all", () => {
    expect(passwordProblem("Short1!")).toMatch(/at least 12/);
    expect(passwordProblem("correct horse battery staple")).toBeNull();
  });

  it("refuses the words everyone tries first", () => {
    expect(passwordProblem("mypasswordislong")).toMatch(/guessed first/);
    expect(passwordProblem("GoTutors2026Rocks")).toMatch(/guessed first/);
  });
});
