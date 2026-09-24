import { describe, it, expect } from "vitest";
import { isUnstored, paperOwnerHint, paperOwnerLabel } from "./paper-label";

describe("paperOwnerLabel", () => {
  it("uses the student's name once a paper is stored", () => {
    expect(paperOwnerLabel({ student: { name: "Priya Raman" }, reference: "desk 4" })).toBe("Priya Raman");
  });

  it("falls back to what the tutor typed while quick marking", () => {
    expect(paperOwnerLabel({ student: null, reference: "desk 4" })).toBe("desk 4");
  });

  it("never renders blank, whatever it is given", () => {
    expect(paperOwnerLabel({ student: null, reference: "   " })).toBe("Unnamed paper");
    expect(paperOwnerLabel({ student: null, reference: null })).toBe("Unnamed paper");
    expect(paperOwnerLabel({ student: null })).toBe("Unnamed paper");
  });
});

describe("paperOwnerHint", () => {
  it("shows the admission number, which is what staff search by", () => {
    expect(paperOwnerHint({ student: { name: "Priya", admissionNumber: "A-0042" }, reference: null })).toBe("A-0042");
  });

  it("says plainly that an unstored paper is not filed", () => {
    expect(paperOwnerHint({ student: null, reference: "desk 4" })).toBe("Not stored against a student");
  });
});

describe("isUnstored", () => {
  it("is exactly 'has no student yet'", () => {
    expect(isUnstored({ studentId: null })).toBe(true);
    expect(isUnstored({ studentId: "s1" })).toBe(false);
  });
});
