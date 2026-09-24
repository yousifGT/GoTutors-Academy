import { describe, it, expect } from "vitest";
import { normaliseAdmissionNumber, rankStudents, studentSearchFilter } from "./student-search";

describe("normaliseAdmissionNumber", () => {
  it("ignores case and the separators people type inconsistently", () => {
    for (const written of ["A-0042", "a 0042", "A/0042", "a_0042", " A0042 "]) {
      expect(normaliseAdmissionNumber(written)).toBe("A0042");
    }
  });

  it("keeps genuinely different numbers apart", () => {
    expect(normaliseAdmissionNumber("A1")).not.toBe(normaliseAdmissionNumber("A10"));
  });
});

describe("studentSearchFilter", () => {
  it("searches both the name and the number", () => {
    const filter = JSON.stringify(studentSearchFilter("ali"));
    expect(filter).toContain("name");
    expect(filter).toContain("admissionNumber");
  });

  it("an empty box means show the list, not show nothing", () => {
    expect(studentSearchFilter("")).toEqual({});
    expect(studentSearchFilter("   ")).toEqual({});
  });
});

describe("rankStudents", () => {
  const students = [
    { name: "Zara", admissionNumber: "A-100" },
    { name: "Yusuf", admissionNumber: "A-10" },
    { name: "Xanthe", admissionNumber: "A-1" },
  ];

  it("puts the exact number first, not the shortest prefix match", () => {
    expect(rankStudents(students, "A-1")[0].admissionNumber).toBe("A-1");
  });

  it("matches the exact number however it was typed", () => {
    expect(rankStudents(students, "a 1")[0].admissionNumber).toBe("A-1");
  });

  it("falls back to name order when nothing matches exactly", () => {
    expect(rankStudents(students, "A-9").map((s) => s.name)).toEqual(["Xanthe", "Yusuf", "Zara"]);
  });

  it("leaves the list alone for an empty query", () => {
    expect(rankStudents(students, "").map((s) => s.name)).toEqual(["Zara", "Yusuf", "Xanthe"]);
  });
});
