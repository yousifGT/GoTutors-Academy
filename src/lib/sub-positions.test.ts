import { describe, it, expect } from "vitest";
import { effectiveSubPositions, tutorTitleFor } from "./sub-positions";

describe("tutorTitleFor", () => {
  it("turns a '<subject> Trainee' field into '<subject> Tutor'", () => {
    expect(tutorTitleFor("Maths Trainee")).toBe("Maths Tutor");
    expect(tutorTitleFor("11+ Trainee")).toBe("11+ Tutor");
    expect(tutorTitleFor("maths trainee")).toBe("maths Tutor");
  });

  it("keeps '<subject> Tutor' fields as-is (no 'Tutor Tutor')", () => {
    expect(tutorTitleFor("Maths Tutor")).toBe("Maths Tutor");
    expect(tutorTitleFor("Science Tutor")).toBe("Science Tutor");
  });

  it("appends Tutor to bare subject names", () => {
    expect(tutorTitleFor("Maths")).toBe("Maths Tutor");
    expect(tutorTitleFor("Head of Centre")).toBe("Head of Centre Tutor");
  });
});

describe("effectiveSubPositions", () => {
  it("merges the multi array with the legacy single column, deduped", () => {
    expect(effectiveSubPositions({ subPosition: "A", subPositions: ["A", "B"] })).toEqual(["A", "B"]);
    expect(effectiveSubPositions({ subPosition: null, subPositions: [] })).toEqual([]);
    expect(effectiveSubPositions({ subPosition: "C", subPositions: [] })).toEqual(["C"]);
  });
});
