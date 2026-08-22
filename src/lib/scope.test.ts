import { describe, it, expect } from "vitest";
import { centreUserScope, canManageUser, canViewCertificate } from "./scope";

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

describe("canViewCertificate", () => {
  const target = { id: "t1", centreId: "london", supervisorId: "sup1" };

  it("lets people see their own", () => {
    expect(canViewCertificate({ id: "t1", roleType: "TRAINEE", centreId: null }, target)).toBe(true);
  });

  it("lets a super admin see anyone's", () => {
    expect(canViewCertificate({ id: "a", roleType: "SUPER_ADMIN", centreId: null }, target)).toBe(true);
  });

  it("lets a centre admin see their own centre's", () => {
    expect(canViewCertificate({ id: "a", roleType: "CENTRE_ADMIN", centreId: "london" }, target)).toBe(true);
    expect(canViewCertificate({ id: "a", roleType: "CENTRE_ADMIN", centreId: "leeds" }, target)).toBe(false);
  });

  // A null centre is a data anomaly; it must never match another null.
  it("refuses a centre admin with no centre", () => {
    expect(canViewCertificate({ id: "a", roleType: "CENTRE_ADMIN", centreId: null }, { id: "t2", centreId: null, supervisorId: null })).toBe(false);
  });

  it("lets a supervisor see their report's, but not a stranger's", () => {
    expect(canViewCertificate({ id: "sup1", roleType: "INSTRUCTOR", centreId: null }, target)).toBe(true);
    expect(canViewCertificate({ id: "other", roleType: "INSTRUCTOR", centreId: "london" }, target)).toBe(false);
  });
});
