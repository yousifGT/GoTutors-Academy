import { describe as suite, it, expect } from "vitest";
import { ACTIONS, canRead, canReadAudit, describe, readableActions, summarise, visibleGroups } from "./audit-view";

suite("who may read what", () => {
  it("a super admin sees everything", () => {
    expect(visibleGroups("SUPER_ADMIN")).toEqual(["people", "checklist", "centres", "inspections", "visits"]);
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
      "auth.signin",
      "auth.failed",
      "auth.blocked",
      "password.forgot",
      "password.reset",
      "email.test",
    ]);
    // Not a prefix rule: who asked for a reset link belongs with account
    // administration even though it is not named "user.something".
    expect(headOffice).not.toContain("password.forgot");
  });

  it("keeps an unclassified action out of the wider audience", () => {
    // An action nobody has listed is one nobody has decided the audience for.
    // Falling back to a group head office can read would mean adding an action
    // and forgetting to classify it quietly widens who can see it.
    expect(canRead("HEAD_OFFICE", "something.new")).toBe(false);
    expect(canRead("SUPER_ADMIN", "something.new")).toBe(true);
    expect(describe("something.new").group).toBe("people");
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

  it("puts an unprefixed action with the most restricted group", () => {
    // This used to fall through to "inspections", which head office can read.
    // An action nobody has classified is one nobody has decided the audience
    // for, so it goes where only a super admin sees it until somebody does.
    expect(describe("odd").group).toBe("people");
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

suite("every action the code writes is in the table", () => {
  it("or it is written to the log and never shown", async () => {
    // Found the hard way: `report.sent_external` was being recorded correctly
    // and did not appear in the activity screen, because `readableActions`
    // builds the query from ACTIONS and an unlisted action is never asked for.
    // A label is not cosmetic here — it is what makes the row readable at all.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(full) && !full.endsWith(".test.ts")) files.push(full);
      }
    };
    walk(join(__dirname, ".."));

    const emitted = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(/action: "([a-z_]+\.[a-z_]+)"/g)) emitted.add(m[1]);
    }

    expect(emitted.size).toBeGreaterThan(20);
    expect(Array.from(emitted).filter((a) => !(a in ACTIONS)).sort()).toEqual([]);
  });
});
