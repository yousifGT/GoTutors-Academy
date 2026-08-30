import { describe, it, expect } from "vitest";
import { effectiveSubPositions, tutorTitleFor, fieldNameForTutorTitle, tutoredFieldNames, collidingFieldName } from "./sub-positions";

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

describe("fieldNameForTutorTitle is deterministic when titles collide", () => {
  // "Maths", "Maths Trainee" and "Maths Tutor" all promote to "Maths Tutor".
  // `find` over an unordered query meant two call sites could disagree, and the
  // answer could change between requests, evaluating a tutor against the wrong
  // course set.
  const colliding = ["Maths Trainee", "Maths Tutor", "Maths"];

  it("prefers the field whose name is the title", () => {
    expect(fieldNameForTutorTitle("Maths Tutor", colliding)).toBe("Maths Tutor");
  });

  it("gives the same answer whatever order the fields arrive in", () => {
    const answers = new Set([
      fieldNameForTutorTitle("Maths Tutor", ["Maths Trainee", "Maths"]),
      fieldNameForTutorTitle("Maths Tutor", ["Maths", "Maths Trainee"]),
    ]);
    expect(answers.size).toBe(1);
    expect([...answers][0]).toBe("Maths");
  });

  it("is unchanged when nothing collides", () => {
    expect(fieldNameForTutorTitle("Maths Tutor", ["Maths Trainee", "English Trainee"])).toBe("Maths Trainee");
    expect(fieldNameForTutorTitle("History Tutor", ["Maths Trainee"])).toBeNull();
  });
});

describe("collidingFieldName", () => {
  it("catches a new name that promotes to an existing title", () => {
    expect(collidingFieldName("Maths Trainee", ["Maths Tutor", "English Trainee"])).toBe("Maths Tutor");
    expect(collidingFieldName("Maths", ["Maths Trainee"])).toBe("Maths Trainee");
  });

  it("allows a genuinely new field", () => {
    expect(collidingFieldName("History Trainee", ["Maths Tutor", "English Trainee"])).toBeNull();
  });

  // A rename passes the other fields, so the field must not clash with itself.
  it("ignores the field's own name", () => {
    expect(collidingFieldName("Maths Tutor", ["Maths Tutor"])).toBeNull();
  });
});
