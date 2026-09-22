import { describe, it, expect } from "vitest";
import { bandFor, feedbackFromMarks, listLabels, summarise } from "./feedback";
import type { CheckedMark } from "./types";

function mark(over: Partial<CheckedMark>): CheckedMark {
  return {
    questionId: "q",
    label: "1",
    order: 0,
    transcript: "x",
    legible: true,
    awarded: 1,
    available: 1,
    comment: "",
    confidence: 1,
    needsHuman: false,
    reasons: [],
    ...over,
  };
}

describe("bandFor", () => {
  it("bands the whole range without a gap", () => {
    expect(bandFor(100).key).toBe("excellent");
    expect(bandFor(90).key).toBe("excellent");
    expect(bandFor(89).key).toBe("strong");
    expect(bandFor(75).key).toBe("strong");
    expect(bandFor(74).key).toBe("secure");
    expect(bandFor(60).key).toBe("secure");
    expect(bandFor(59).key).toBe("developing");
    expect(bandFor(40).key).toBe("developing");
    expect(bandFor(39).key).toBe("support");
    expect(bandFor(0).key).toBe("support");
  });
});

describe("feedbackFromMarks", () => {
  it("names the questions that went well and the ones that didn't", () => {
    const { strengths, improvements } = feedbackFromMarks([
      mark({ label: "1", awarded: 1, available: 1 }),
      mark({ label: "2", awarded: 0, available: 2 }),
      mark({ label: "3", awarded: 1, available: 3 }),
    ]);
    expect(strengths.join(" ")).toContain("Q1");
    expect(improvements.join(" ")).toContain("Q2");
    expect(improvements.join(" ")).toContain("Q3");
  });

  it("never returns an empty improvements list on a perfect paper", () => {
    const { improvements } = feedbackFromMarks([mark({ awarded: 1, available: 1 })]);
    expect(improvements.length).toBeGreaterThan(0);
  });

  it("ignores questions worth nothing, which are the stray ones", () => {
    const { strengths } = feedbackFromMarks([
      mark({ label: "1", awarded: 1, available: 1 }),
      mark({ label: "99", awarded: 0, available: 0 }),
    ]);
    expect(strengths.join(" ")).toContain("1 of 1 questions");
  });
});

describe("listLabels", () => {
  it("reads as a sentence", () => {
    expect(listLabels([mark({ label: "1" })])).toBe("Q1");
    expect(listLabels([mark({ label: "1" }), mark({ label: "2" })])).toBe("Q1 and Q2");
    expect(listLabels([mark({ label: "1" }), mark({ label: "2" }), mark({ label: "3" })])).toBe("Q1, Q2 and Q3");
  });

  it("caps a long list instead of listing thirty questions", () => {
    const many = Array.from({ length: 10 }, (_, i) => mark({ label: String(i + 1) }));
    expect(listLabels(many)).toBe("Q1, Q2, Q3, Q4 and 6 more");
  });
});

describe("summarise", () => {
  it("gives the score, the percentage and what it means", () => {
    expect(summarise(9, 10)).toContain("9 out of 10 (90%)");
    expect(summarise(9, 10).toLowerCase()).toContain("excellent");
  });
});
