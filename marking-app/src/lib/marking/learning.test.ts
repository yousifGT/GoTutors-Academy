import { describe, it, expect } from "vitest";
import { countCorrections, examplesFromReview, type ReviewedMark } from "./learning";

function reviewed(over: Partial<ReviewedMark> = {}): ReviewedMark {
  return {
    questionId: "q1",
    transcript: "45",
    awarded: 2,
    available: 2,
    comment: "Right.",
    edited: false,
    ...over,
  };
}

describe("examplesFromReview", () => {
  it("records a changed mark as a correction", () => {
    expect(examplesFromReview([reviewed({ edited: true })])[0].source).toBe("HUMAN_CORRECTED");
  });

  it("records an unchanged mark as a confirmation", () => {
    expect(examplesFromReview([reviewed({ edited: false })])[0].source).toBe("AI_CONFIRMED");
  });

  it("drops a mark with no student answer — there is nothing to learn from", () => {
    expect(examplesFromReview([reviewed({ transcript: "   " })])).toHaveLength(0);
  });

  it("drops a mark not tied to a scheme question, which could never be retrieved", () => {
    expect(examplesFromReview([reviewed({ questionId: null })])).toHaveLength(0);
  });

  it("trims what it stores, so whitespace differences don't look like different answers", () => {
    const [draft] = examplesFromReview([reviewed({ transcript: "  45  ", comment: "  Right.  " })]);
    expect(draft.studentAnswer).toBe("45");
    expect(draft.examinerComment).toBe("Right.");
  });
});

describe("countCorrections", () => {
  it("counts both sides, so 'it agreed with me 18 times out of 20' is a real number", () => {
    const counts = countCorrections([reviewed({ edited: true }), reviewed(), reviewed()]);
    expect(counts).toEqual({ corrected: 1, confirmed: 2 });
  });
});
