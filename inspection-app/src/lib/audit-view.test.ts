import { describe as suite, it, expect } from "vitest";
import { canRead, canReadAudit, describe, readableActions, summarise, visibleGroups } from "./audit-view";

suite("who may read what", () => {
  it("a super admin sees everything", () => {
    expect(visibleGroups("SUPER_ADMIN")).toEqual(["people", "centres", "inspections", "visits"]);
  });

  it("head office sees the operation but not account administration", () => {
    // Account changes are the record of who holds access, and the people who
    // hold access should not be the only ones able to read it quietly.
    expect(visibleGroups("HEAD_OFFICE")).toEqual(["centres", "inspections", "visits"]);
    expect(canRead("HEAD_OFFICE", "user.deactivate")).toBe(false);
    expect(canRead("HEAD_OFFICE", "visit.missed")).toBe(true);
  });

  it("nobody else reads the audit log at all", () => {
    for (const role of ["REGIONAL_MANAGER", "FRANCHISEE", "CENTRE_HEAD", "INSPECTOR", "READ_ONLY"] as const) {
      expect(canReadAudit(role), role).toBe(false);
      expect(visibleGroups(role)).toEqual([]);
    }
  });

  it("gives a database filter matching what the role may see", () => {
    const headOffice = readableActions("HEAD_OFFICE");
    expect(headOffice).toContain("inspection.submit");
    expect(headOffice).not.toContain("user.create");
    expect(readableActions("SUPER_ADMIN", "people")).toEqual([
      "user.create",
      "user.update",
      "user.deactivate",
      "user.delete",
      "user.password_change",
    ]);
  });
});

suite("describe", () => {
  it("gives every recorded action a readable name", () => {
    expect(describe("visit.missed").label).toBe("Visit marked missed");
    expect(describe("inspection.pdf").label).toBe("Report downloaded");
  });

  it("marks the ones worth noticing at a glance", () => {
    expect(describe("visit.missed").notable).toBe(true);
    expect(describe("inspection.pdf").notable).toBeUndefined();
  });

  it("shows an unknown action rather than hiding it", () => {
    // An action nobody has named means the log has outgrown this table, which
    // is exactly when it must not disappear.
    const unknown = describe("visit.something_new");
    expect(unknown.label).toBe("visit.something_new");
    expect(unknown.group).toBe("visits");
    expect(canRead("HEAD_OFFICE", "visit.something_new")).toBe(true);
  });

  it("puts an unprefixed action with the inspections", () => {
    expect(describe("odd").group).toBe("inspections");
  });
});

suite("summarise", () => {
  it("turns metadata into short readable pairs", () => {
    expect(summarise({ pct: 88, verdict: "Good" })).toEqual([
      { key: "score", value: "88" },
      { key: "verdict", value: "Good" },
    ]);
  });

  it("leaves out nested objects, arrays and blanks", () => {
    expect(summarise({ criticalFails: ["a"], nested: { x: 1 }, empty: "", nil: null, keep: 2 })).toEqual([
      { key: "keep", value: "2" },
    ]);
  });

  it("copes with anything that is not an object", () => {
    expect(summarise(null)).toEqual([]);
    expect(summarise("text")).toEqual([]);
    expect(summarise([1, 2])).toEqual([]);
  });

  it("spaces out a camelCase key it has no name for", () => {
    expect(summarise({ someOtherThing: 1 })).toEqual([{ key: "some other thing", value: "1" }]);
  });
});
