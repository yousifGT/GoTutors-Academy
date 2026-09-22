import { describe, it, expect } from "vitest";
import { checkMarking, normaliseLabel, percentageOf, CONFIDENCE_FLOOR } from "./scoring";
import type { RawMarking, SchemeQuestion } from "./types";

const questions: SchemeQuestion[] = [
  { id: "q1", label: "1", order: 0, prompt: "2+2", expectedAnswer: "4", marks: 1 },
  { id: "q2", label: "2a", order: 1, prompt: "3/4 of 60", expectedAnswer: "45", marks: 2 },
];

function raw(partial: Partial<RawMarking> = {}): RawMarking {
  return {
    marks: [],
    strengths: [],
    improvements: [],
    overallComment: "",
    unreadable: false,
    ...partial,
  };
}

function mark(over: Partial<RawMarking["marks"][number]> = {}) {
  return {
    label: "1",
    transcript: "4",
    legible: true,
    awarded: 1,
    comment: "Correct.",
    confidence: 0.95,
    ...over,
  };
}

describe("checkMarking", () => {
  it("keeps the scheme's denominator, not the model's numerator", () => {
    // The model claims 9 marks for a question worth 2.
    const result = checkMarking(raw({ marks: [mark({ label: "2a", awarded: 9 })] }), questions);
    const q2 = result.marks.find((m) => m.label === "2a")!;
    expect(q2.available).toBe(2);
    expect(q2.awarded).toBe(2);
    expect(q2.needsHuman).toBe(true);
    expect(q2.reasons.join(" ")).toContain("awarded 9 of a possible 2");
  });

  it("a question the model skipped is a zero that needs a human, not a missing question", () => {
    const result = checkMarking(raw({ marks: [mark()] }), questions);
    expect(result.marks).toHaveLength(2);
    const skipped = result.marks.find((m) => m.label === "2a")!;
    expect(skipped.awarded).toBe(0);
    expect(skipped.needsHuman).toBe(true);
    // The denominator still covers the whole paper, or the percentage lies.
    expect(result.available).toBe(3);
    expect(result.percentage).toBe(33);
  });

  it("sends illegible answers to a human instead of guessing", () => {
    const result = checkMarking(
      raw({ marks: [mark({ legible: false, transcript: "", awarded: 0, confidence: 0 })] }),
      [questions[0]]
    );
    expect(result.marks[0].needsHuman).toBe(true);
    expect(result.marks[0].reasons).toContain("the handwriting could not be read");
    expect(result.needsHuman).toBe(true);
  });

  it("sends low-confidence marks to a human even when they look fine", () => {
    const justBelow = CONFIDENCE_FLOOR - 0.01;
    const result = checkMarking(raw({ marks: [mark({ confidence: justBelow })] }), [questions[0]]);
    expect(result.marks[0].needsHuman).toBe(true);
    expect(result.marks[0].reasons.join(" ")).toContain("low confidence");
  });

  it("accepts a confident, legible, in-range mark without flagging it", () => {
    const result = checkMarking(raw({ marks: [mark()], overallComment: "Good work." }), [questions[0]]);
    expect(result.marks[0].needsHuman).toBe(false);
    expect(result.needsHuman).toBe(false);
    expect(result.awarded).toBe(1);
    expect(result.percentage).toBe(100);
  });

  it("keeps a mark for a question the scheme doesn't have, but gives it no weight", () => {
    const result = checkMarking(raw({ marks: [mark(), mark({ label: "99", awarded: 5 })] }), [questions[0]]);
    const stray = result.marks.find((m) => m.label === "99")!;
    expect(stray.questionId).toBeNull();
    expect(stray.awarded).toBe(0);
    expect(stray.available).toBe(0);
    expect(stray.needsHuman).toBe(true);
    // The real question still scores normally.
    expect(result.awarded).toBe(1);
    expect(result.available).toBe(1);
  });

  it("an unreadable paper needs a human whatever the marks say", () => {
    const result = checkMarking(raw({ marks: [mark()], unreadable: true }), [questions[0]]);
    expect(result.needsHuman).toBe(true);
    expect(result.reasons.join(" ")).toContain("could not make out the paper");
  });

  it("reports the paper's confidence as its weakest question", () => {
    const result = checkMarking(
      raw({ marks: [mark({ label: "1", confidence: 0.99 }), mark({ label: "2a", awarded: 2, confidence: 0.7 })] }),
      questions
    );
    expect(result.confidence).toBeCloseTo(0.7);
  });

  it("rejects a part mark rather than rounding one in silently", () => {
    const result = checkMarking(raw({ marks: [mark({ label: "2a", awarded: 1.5 })] }), [questions[1]]);
    expect(result.marks[0].reasons.join(" ")).toContain("part mark");
    expect(result.marks[0].needsHuman).toBe(true);
  });

  it("matches labels written differently on the paper and in the scheme", () => {
    const result = checkMarking(raw({ marks: [mark({ label: "Q2 a", awarded: 2 })] }), [questions[1]]);
    expect(result.marks[0].awarded).toBe(2);
    expect(result.marks[0].questionId).toBe("q2");
  });

  it("an empty scheme scores nothing and says so, rather than dividing by zero", () => {
    const result = checkMarking(raw(), []);
    expect(result.percentage).toBe(0);
    expect(result.needsHuman).toBe(true);
  });
});

describe("normaliseLabel", () => {
  it("treats every way of writing the same question as the same question", () => {
    for (const written of ["2b", "Q2b", "q2 b", "2B", "2.b", "2)b"]) {
      expect(normaliseLabel(written)).toBe("2b");
    }
  });

  it("keeps different questions apart", () => {
    expect(normaliseLabel("2a")).not.toBe(normaliseLabel("2b"));
    expect(normaliseLabel("12")).not.toBe(normaliseLabel("1"));
  });
});

describe("percentageOf", () => {
  it("rounds to whole percent", () => {
    expect(percentageOf(1, 3)).toBe(33);
    expect(percentageOf(2, 3)).toBe(67);
  });

  it("is 0 rather than NaN when nothing is available", () => {
    expect(percentageOf(0, 0)).toBe(0);
  });
});
