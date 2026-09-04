import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  canConduct,
  canEditInspection,
  canManageCentres,
  canAssignCentreHead,
  canRequestCentreHead,
  canDecideHeadRequest,
  canManageTemplate,
  readsWholeCentre,
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

  it("the checklist is the super admin's alone; head office manages centres", () => {
    expect(ROLES.filter(canManageTemplate)).toEqual(["SUPER_ADMIN"]);
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

describe("readsWholeCentre", () => {
  const mine = ["u-head"];

  it("lets through the roles that already read every centre", () => {
    for (const role of ["SUPER_ADMIN", "HEAD_OFFICE", "READ_ONLY"] as const)
      expect(readsWholeCentre({ id: "u-x", role }, mine)).toBe(true);
  });

  it("lets a centre-scoped viewer into the centre they are responsible for", () => {
    expect(readsWholeCentre({ id: "u-head", role: "CENTRE_HEAD" }, mine)).toBe(true);
    expect(readsWholeCentre({ id: "u-head", role: "FRANCHISEE" }, mine)).toBe(true);
    expect(readsWholeCentre({ id: "u-head", role: "REGIONAL_MANAGER" }, mine)).toBe(true);
  });

  it("keeps them out of a centre that is not theirs", () => {
    expect(readsWholeCentre({ id: "u-other", role: "CENTRE_HEAD" }, mine)).toBe(false);
  });

  it("keeps out an inspector, who reads only their own visits", () => {
    // They may be sent anywhere, so they see every centre in the picker — but
    // they read only the inspections they carried out. A comparison drawn
    // across a subset of a centre's visits would not be the comparison it
    // claims to be.
    expect(readsWholeCentre({ id: "u-insp", role: "INSPECTOR" }, mine)).toBe(false);
    expect(readsWholeCentre({ id: "u-insp", role: "INSPECTOR" }, ["u-insp"])).toBe(false);
  });
});

describe("canAssignCentreHead", () => {
  it("is the roles that administer centres, and nobody else", () => {
    // Appointing a head of centre grants somebody access to inspection records.
    // That decision sits with the people accountable for who holds access. A
    // franchisee asks for it; see canRequestCentreHead.
    expect(canAssignCentreHead({ id: "u-x", role: "SUPER_ADMIN" })).toBe(true);
    expect(canAssignCentreHead({ id: "u-x", role: "HEAD_OFFICE" })).toBe(true);
    for (const role of ["FRANCHISEE", "CENTRE_HEAD", "REGIONAL_MANAGER", "INSPECTOR", "READ_ONLY"] as const)
      expect(canAssignCentreHead({ id: "u-x", role }), role).toBe(false);
  });
});

describe("canRequestCentreHead", () => {
  const theirs = ["u-franchisee"];

  it("lets a franchisee ask, at a centre they run", () => {
    expect(canRequestCentreHead({ id: "u-franchisee", role: "FRANCHISEE" }, theirs)).toBe(true);
  });

  it("and not at one they do not", () => {
    expect(canRequestCentreHead({ id: "u-other", role: "FRANCHISEE" }, theirs)).toBe(false);
  });

  it("keeps out everyone else, including at their own centre", () => {
    // A head of centre nominating the next head of centre is a promotion path
    // nobody asked for. A regional manager reads their centres; who runs them is
    // the franchisee's business or head office's.
    for (const role of ["CENTRE_HEAD", "REGIONAL_MANAGER", "INSPECTOR", "READ_ONLY"] as const)
      expect(canRequestCentreHead({ id: "u-franchisee", role }, theirs), role).toBe(false);
  });

  it("does not overlap with the people who decide", () => {
    // The asker and the answerer are never the same person. A super admin who
    // wants a head of centre assigns one; they have no reason to raise a request
    // with themselves, and the routes are separate so neither can stand in for
    // the other.
    for (const role of ["SUPER_ADMIN", "HEAD_OFFICE"] as const)
      expect(canRequestCentreHead({ id: "u-franchisee", role }, theirs), role).toBe(false);
  });
});

describe("canDecideHeadRequest", () => {
  it("is the super admin alone", () => {
    // Narrower than canAssignCentreHead on purpose. Head office can appoint a
    // head at a centre it administers; answering a franchisee's request is the
    // approval step the franchisee's own limits exist to create, so it stays
    // with the one role that holds account administration.
    expect(canDecideHeadRequest("SUPER_ADMIN")).toBe(true);
    for (const role of ["HEAD_OFFICE", "FRANCHISEE", "CENTRE_HEAD", "REGIONAL_MANAGER", "INSPECTOR", "READ_ONLY"] as const)
      expect(canDecideHeadRequest(role), role).toBe(false);
  });
});
