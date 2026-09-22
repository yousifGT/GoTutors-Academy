import { describe, it, expect } from "vitest";
import { selectExamples, spreadByScore } from "./examples";
import type { WorkedExample } from "./types";

function example(over: Partial<WorkedExample> = {}): WorkedExample {
  return {
    questionId: "q1",
    studentAnswer: "45",
    awarded: 2,
    available: 2,
    examinerComment: "Right.",
    source: "AI_CONFIRMED",
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

describe("selectExamples", () => {
  it("prefers corrections over confirmations — a correction is where the learning is", () => {
    const picked = selectExamples(
      [
        example({ studentAnswer: "confirmed", source: "AI_CONFIRMED", createdAt: new Date("2026-06-01") }),
        example({ studentAnswer: "corrected", source: "HUMAN_CORRECTED", createdAt: new Date("2026-01-01") }),
      ],
      1
    );
    expect(picked.get("q1")!.map((e) => e.studentAnswer)).toEqual(["corrected"]);
  });

  it("prefers recent over old within the same kind, so a changed standard is followed", () => {
    const picked = selectExamples(
      [
        example({ studentAnswer: "old", source: "HUMAN_CORRECTED", createdAt: new Date("2026-01-01") }),
        example({ studentAnswer: "new", source: "HUMAN_CORRECTED", createdAt: new Date("2026-06-01") }),
      ],
      1
    );
    expect(picked.get("q1")!.map((e) => e.studentAnswer)).toEqual(["new"]);
  });

  it("groups by question, so one question's examples never leak into another's", () => {
    const picked = selectExamples([example({ questionId: "q1" }), example({ questionId: "q2" })]);
    expect([...picked.keys()].sort()).toEqual(["q1", "q2"]);
    expect(picked.get("q1")).toHaveLength(1);
  });

  it("drops examples with no question — they could never be retrieved again", () => {
    const picked = selectExamples([example({ questionId: null })]);
    expect(picked.size).toBe(0);
  });

  it("respects the per-question cap", () => {
    const pool = Array.from({ length: 10 }, (_, i) => example({ studentAnswer: String(i) }));
    expect(selectExamples(pool, 3).get("q1")).toHaveLength(3);
  });
});

describe("spreadByScore", () => {
  it("shows the range of the scheme rather than four full-mark answers", () => {
    const pool = [
      example({ awarded: 2, studentAnswer: "full-a" }),
      example({ awarded: 2, studentAnswer: "full-b" }),
      example({ awarded: 2, studentAnswer: "full-c" }),
      example({ awarded: 0, studentAnswer: "zero" }),
      example({ awarded: 1, studentAnswer: "half" }),
    ];
    const scores = spreadByScore(pool, 3).map((e) => e.awarded);
    expect(new Set(scores)).toEqual(new Set([0, 1, 2]));
  });

  it("stops when there is nothing left rather than looping", () => {
    expect(spreadByScore([example()], 5)).toHaveLength(1);
    expect(spreadByScore([], 5)).toHaveLength(0);
  });
});
