import { describe, it, expect } from "vitest";
import { SchemeSchema, duplicateLabel } from "./scheme-schema";

const valid = {
  title: "Year 6 Arithmetic",
  subject: "Maths",
  questions: [{ label: "1", prompt: "2+2", expectedAnswer: "4", marks: 1 }],
};

describe("SchemeSchema", () => {
  it("accepts a minimal scheme", () => {
    expect(SchemeSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a scheme with no questions — it could never mark anything", () => {
    expect(SchemeSchema.safeParse({ ...valid, questions: [] }).success).toBe(false);
  });

  it("refuses a question worth zero marks", () => {
    const result = SchemeSchema.safeParse({ ...valid, questions: [{ ...valid.questions[0], marks: 0 }] });
    expect(result.success).toBe(false);
  });

  it("refuses part marks, which the mark columns cannot represent", () => {
    expect(SchemeSchema.safeParse({ ...valid, questions: [{ ...valid.questions[0], marks: 1.5 }] }).success).toBe(false);
  });

  it("requires an expected answer — without one there is nothing to mark against", () => {
    const { expectedAnswer, ...rest } = valid.questions[0];
    void expectedAnswer;
    expect(SchemeSchema.safeParse({ ...valid, questions: [rest] }).success).toBe(false);
  });
});

describe("duplicateLabel", () => {
  it("catches a repeat however it is cased or spaced", () => {
    expect(duplicateLabel([{ label: "2a" }, { label: " 2A " }])).toBe(" 2A ");
  });

  it("is null when every label is distinct", () => {
    expect(duplicateLabel([{ label: "1" }, { label: "2a" }, { label: "2b" }])).toBeNull();
  });
});
