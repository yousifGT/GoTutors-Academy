import { describe, it, expect } from "vitest";
import { actionLabel, auditDetail, auditFacts, describeTarget, looksLikeUserId, userIdTargets } from "./audit-view";

describe("looksLikeUserId", () => {
  it("recognises a cuid", () => {
    expect(looksLikeUserId("cmsa7cgm6000114anaakbcdqz")).toBe(true);
  });

  // Most call sites write readable labels; those must be left alone.
  it("leaves existing labels alone", () => {
    expect(looksLikeUserId("role:Tutor")).toBe(false);
    expect(looksLikeUserId("Trainee:Maths Tutor")).toBe(false);
    expect(looksLikeUserId("user:someone@example.com")).toBe(false);
    expect(looksLikeUserId("Trainee:Maths Tutor → Maths Coach")).toBe(false);
  });

  it("handles missing targets", () => {
    expect(looksLikeUserId(null)).toBe(false);
    expect(looksLikeUserId(undefined)).toBe(false);
    expect(looksLikeUserId("")).toBe(false);
  });

  it("rejects a short string that merely starts with c", () => {
    expect(looksLikeUserId("centre")).toBe(false);
  });
});

describe("userIdTargets", () => {
  it("returns only the ids, deduplicated", () => {
    expect(
      userIdTargets(["cmsa7cgm6000114anaakbcdqz", "role:Tutor", "cmsa7cgm6000114anaakbcdqz", null])
    ).toEqual(["cmsa7cgm6000114anaakbcdqz"]);
  });
});

describe("auditDetail", () => {
  // The case that made three separate promotions look like one repeated entry.
  it("pulls the field out of a promotion entry", () => {
    expect(auditDetail({ field: "English Tutor", tutorTitle: "English Tutor", auto: true })).toBe("English Tutor");
  });

  it("falls back through the other naming keys", () => {
    expect(auditDetail({ tutorTitle: "Maths Tutor" })).toBe("Maths Tutor");
    expect(auditDetail({ subPosition: "Head of Centre" })).toBe("Head of Centre");
    expect(auditDetail({ name: "Science Tutor" })).toBe("Science Tutor");
  });

  it("returns null when there is nothing distinguishing", () => {
    expect(auditDetail(null)).toBeNull();
    expect(auditDetail({ auto: true, roleUpgraded: false })).toBeNull();
    expect(auditDetail("a string")).toBeNull();
    expect(auditDetail({ field: "   " })).toBeNull();
  });
});

describe("actionLabel", () => {
  // The two slugs that were shown raw on the audit page.
  it("names the known actions", () => {
    expect(actionLabel("user.auto_promoted_tutor")).toBe("Promoted to tutor (automatic)");
    expect(actionLabel("sub-position.delete")).toBe("Removed sub-position");
    expect(actionLabel("user.password_changed_self")).toBe("Changed own password");
  });

  // A slug added later should still read as words, not as a placeholder.
  it("tidies up an unknown slug", () => {
    expect(actionLabel("centre.merged_into")).toBe("Centre merged into");
    expect(actionLabel("")).toBe("");
  });
});

describe("describeTarget", () => {
  it("drops a prefix the action already stated", () => {
    expect(describeTarget("role.delete", "role:Tutor")).toEqual({ label: "Tutor", qualifier: null });
    expect(describeTarget("course.require_retraining", "course:Algebra 1")).toEqual({
      label: "Algebra 1",
      qualifier: null,
    });
    expect(describeTarget("sub-position.create", "sub-position:Maths Trainee")).toEqual({
      label: "Maths Trainee",
      qualifier: null,
    });
  });

  it("splits the legacy Role:Name form written before the formats were unified", () => {
    expect(describeTarget("sub-position.delete", "Trainee:Maths Tutor")).toEqual({
      label: "Maths Tutor",
      qualifier: "Trainee",
    });
  });

  // The entry that read `Trainee:,` — a sub-position genuinely named ",".
  it("does not pretend a punctuation name is a name", () => {
    expect(describeTarget("sub-position.delete", "Trainee:,")).toEqual({ label: ",", qualifier: "Trainee" });
    expect(describeTarget("sub-position.delete", "Trainee:")).toEqual({ label: "(unnamed)", qualifier: "Trainee" });
  });

  it("leaves an unprefixed target alone", () => {
    expect(describeTarget("user.password_changed_self", "cmsa7cgm6000114anaakbcdqz")).toEqual({
      label: "cmsa7cgm6000114anaakbcdqz",
      qualifier: null,
    });
    expect(describeTarget("role.delete", null)).toBeNull();
  });

  // A colon inside a value must not be mistaken for the separator.
  it("splits on the first colon only", () => {
    expect(describeTarget("sub-position.rename", "sub-position:Maths → Maths: Advanced")).toEqual({
      label: "Maths → Maths: Advanced",
      qualifier: null,
    });
  });
});

describe("auditFacts", () => {
  it("spells out the parts worth reading", () => {
    expect(auditFacts({ permission: "users.manage" })).toEqual(["Permission: users.manage"]);
    expect(auditFacts({ role: "Trainee" })).toEqual(["Role: Trainee"]);
    expect(auditFacts({ fromVersion: 3 })).toEqual(["Certificates below v3 superseded"]);
    expect(auditFacts({ roleUpgraded: true })).toEqual(["Role upgraded to Tutor"]);
    expect(auditFacts({ remainingFields: ["Maths", "Science"] })).toEqual(["Still training: Maths, Science"]);
  });

  // Keys shown elsewhere in the row, or carrying nothing, add noise.
  it("stays quiet when there is nothing to add", () => {
    expect(auditFacts({ field: "Maths", tutorTitle: "Maths Tutor", auto: true })).toEqual([]);
    expect(auditFacts({ remainingFields: [] })).toEqual([]);
    expect(auditFacts({ roleUpgraded: false })).toEqual([]);
    expect(auditFacts(null)).toEqual([]);
    expect(auditFacts(["not", "an", "object"])).toEqual([]);
  });
});
