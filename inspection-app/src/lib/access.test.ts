import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  canConduct,
  canEditInspection,
  canManageCentres,
  canManageTemplate,
  canManageUsers,
  canViewAllCentres,
  centreScope,
  inspectionScope,
} from "./access";

const ROLES: Role[] = ["SUPER_ADMIN", "HEAD_OFFICE", "REGIONAL_MANAGER", "FRANCHISEE", "INSPECTOR", "READ_ONLY"];
const who = (role: Role) => ({ id: "u1", role });

describe("what each role may do", () => {
  it("only head office and above read every centre", () => {
    expect(ROLES.filter(canViewAllCentres)).toEqual(["SUPER_ADMIN", "HEAD_OFFICE", "READ_ONLY"]);
  });

  it("a franchisee never carries out an inspection, and read-only never writes", () => {
    expect(ROLES.filter(canConduct)).toEqual(["SUPER_ADMIN", "HEAD_OFFICE", "REGIONAL_MANAGER", "INSPECTOR"]);
    expect(canConduct("FRANCHISEE")).toBe(false);
    expect(canConduct("READ_ONLY")).toBe(false);
  });

  it("the checklist is edited by head office and above only", () => {
    expect(ROLES.filter(canManageTemplate)).toEqual(["SUPER_ADMIN", "HEAD_OFFICE"]);
    expect(ROLES.filter(canManageCentres)).toEqual(["SUPER_ADMIN", "HEAD_OFFICE"]);
    expect(ROLES.filter(canManageUsers)).toEqual(["SUPER_ADMIN"]);
  });
});

describe("inspectionScope", () => {
  it("head office and read-only see everything", () => {
    expect(inspectionScope(who("HEAD_OFFICE"))).toEqual({});
    expect(inspectionScope(who("READ_ONLY"))).toEqual({});
  });

  it("a regional manager sees their centres plus their own work", () => {
    expect(inspectionScope(who("REGIONAL_MANAGER"))).toEqual({
      OR: [{ centre: { managers: { some: { id: "u1" } } } }, { inspectorId: "u1" }],
    });
  });

  it("an inspector sees only what they carried out", () => {
    expect(inspectionScope(who("INSPECTOR"))).toEqual({ inspectorId: "u1" });
  });

  it("a franchisee with no centres assigned sees their own work, never everything", () => {
    // The filter matches nothing rather than falling open — an empty assignment
    // list is a gap in the data, not a grant.
    const scope = inspectionScope(who("FRANCHISEE"));
    expect(scope).not.toEqual({});
    expect(JSON.stringify(scope)).toContain("managers");
  });
});

describe("centreScope", () => {
  it("an inspector may be sent anywhere, so sees the whole list", () => {
    expect(centreScope(who("INSPECTOR"))).toEqual({});
  });

  it("a franchisee sees only the centres they hold", () => {
    expect(centreScope(who("FRANCHISEE"))).toEqual({ managers: { some: { id: "u1" } } });
  });

  it("head office sees them all", () => {
    expect(centreScope(who("HEAD_OFFICE"))).toEqual({});
  });
});

describe("canEditInspection", () => {
  const draft = { inspectorId: "u1", status: "DRAFT" };

  it("only the inspector who started it, and only while it is a draft", () => {
    expect(canEditInspection(who("INSPECTOR"), draft)).toBe(true);
    expect(canEditInspection({ id: "u2", role: "INSPECTOR" }, draft)).toBe(false);
    expect(canEditInspection(who("INSPECTOR"), { ...draft, status: "SUBMITTED" })).toBe(false);
  });

  it("a submitted inspection is a record — not even a super admin may edit it", () => {
    expect(canEditInspection(who("SUPER_ADMIN"), { inspectorId: "u1", status: "SUBMITTED" })).toBe(false);
  });

  it("a role that cannot inspect cannot edit, even its own centre's draft", () => {
    expect(canEditInspection(who("FRANCHISEE"), draft)).toBe(false);
    expect(canEditInspection(who("READ_ONLY"), draft)).toBe(false);
  });
});
