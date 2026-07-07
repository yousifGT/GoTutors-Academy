import { describe, it, expect } from "vitest";
import { centreUserScope, canManageUser } from "./scope";

const superAdmin = { roleType: "SUPER_ADMIN" as const, centreId: null };
const londonAdmin = { roleType: "CENTRE_ADMIN" as const, centreId: "london" };
const noCentreAdmin = { roleType: "CENTRE_ADMIN" as const, centreId: null };

describe("centreUserScope", () => {
  it("returns an empty filter (everyone) for a super admin", () => {
    expect(centreUserScope(superAdmin)).toEqual({});
  });
  it("scopes a centre admin to their own centre", () => {
    expect(centreUserScope(londonAdmin)).toEqual({ centreId: "london" });
  });
  it("matches NObody for a centre admin with no centre (never falls back to all)", () => {
    expect(centreUserScope(noCentreAdmin)).toEqual({ id: { in: [] } });
  });
});

describe("canManageUser", () => {
  const trainee = { roleType: "TRAINEE" as const, centreId: "london" };
  const traineeElsewhere = { roleType: "TRAINEE" as const, centreId: "manchester" };
  const traineeNoCentre = { roleType: "TRAINEE" as const, centreId: null };
  const instructor = { roleType: "INSTRUCTOR" as const, centreId: "london" };

  it("super admin can manage anyone", () => {
    expect(canManageUser(superAdmin, trainee)).toBe(true);
    expect(canManageUser(superAdmin, instructor)).toBe(true);
  });
  it("centre admin can manage a trainee in their own centre", () => {
    expect(canManageUser(londonAdmin, trainee)).toBe(true);
  });
  it("centre admin cannot manage a trainee in another centre", () => {
    expect(canManageUser(londonAdmin, traineeElsewhere)).toBe(false);
  });
  it("centre admin cannot manage a non-trainee in their centre", () => {
    expect(canManageUser(londonAdmin, instructor)).toBe(false);
  });
  it("centre admin with no centre cannot manage anyone (no null===null)", () => {
    expect(canManageUser(noCentreAdmin, traineeNoCentre)).toBe(false);
  });
  it("a trainee cannot manage anyone", () => {
    expect(canManageUser({ roleType: "TRAINEE", centreId: "london" }, trainee)).toBe(false);
  });
});
