import { describe, it, expect } from "vitest";
import { effectiveSubPositions, tutorTitleFor, fieldNameForTutorTitle, tutoredFieldNames } from "./sub-positions";

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

// teacherPositions stores the tutor TITLE, and the transform is not reversible
// on its own: "Head of Centre Tutor" could come from the field "Head of Centre"
// or from a field literally named that. Match forwards against real fields.
describe("fieldNameForTutorTitle / tutoredFieldNames", () => {
  const fields = ["Maths Tutor", "English Tutor", "Head of Centre", "Support Staff"];

  it("resolves a title whose field already ends in Tutor", () => {
    expect(fieldNameForTutorTitle("Maths Tutor", fields)).toBe("Maths Tutor");
  });

  it("resolves a title built by appending Tutor", () => {
    expect(fieldNameForTutorTitle("Head of Centre Tutor", fields)).toBe("Head of Centre");
    expect(fieldNameForTutorTitle("Support Staff Tutor", fields)).toBe("Support Staff");
  });

  it("returns null when no field produces that title", () => {
    expect(fieldNameForTutorTitle("Deleted Field Tutor", fields)).toBeNull();
    // The bare field name is not a title, so it must not resolve.
    expect(fieldNameForTutorTitle("Head of Centre", fields)).toBeNull();
  });

  it("maps a list, dropping unresolvable titles and duplicates", () => {
    expect(
      tutoredFieldNames(["Maths Tutor", "Head of Centre Tutor", "Maths Tutor", "Gone Tutor"], fields)
    ).toEqual(["Maths Tutor", "Head of Centre"]);
  });

  it("handles an empty list", () => {
    expect(tutoredFieldNames([], fields)).toEqual([]);
  });
});
