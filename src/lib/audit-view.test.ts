import { describe, it, expect } from "vitest";
import { auditDetail, looksLikeUserId, userIdTargets } from "./audit-view";

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
