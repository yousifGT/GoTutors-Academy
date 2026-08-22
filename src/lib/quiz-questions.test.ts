import { describe, it, expect } from "vitest";
import { questionsEqual } from "./quiz-questions";

const stored = [
  {
    type: "MULTIPLE_CHOICE",
    prompt: "2 + 2?",
    points: 1,
    answers: [
      { text: "4", isCorrect: true },
      { text: "5", isCorrect: false },
    ],
  },
];

describe("questionsEqual", () => {
  // The case that mattered: the editor resends the list on a title-only save.
  it("treats a resubmitted identical list as unchanged", () => {
    expect(
      questionsEqual(stored, [
        { type: "MULTIPLE_CHOICE", prompt: "2 + 2?", answers: [{ text: "4", isCorrect: true }, { text: "5" }] },
      ])
    ).toBe(true);
  });

  it("applies the same defaults the write would", () => {
    expect(questionsEqual([{ type: "OPEN_ENDED", prompt: "Why?", points: 1, answers: [] }], [{ type: "OPEN_ENDED", prompt: "Why?" }])).toBe(true);
  });

  it("spots an edited prompt, points, type or answer", () => {
    expect(questionsEqual(stored, [{ ...stored[0], prompt: "2 + 3?" }])).toBe(false);
    expect(questionsEqual(stored, [{ ...stored[0], points: 2 }])).toBe(false);
    expect(questionsEqual(stored, [{ ...stored[0], type: "OPEN_ENDED" }])).toBe(false);
    expect(questionsEqual(stored, [{ ...stored[0], answers: [{ text: "4", isCorrect: true }] }])).toBe(false);
  });

  // Moving the correct answer is exactly the edit that breaks stored attempts.
  it("spots a moved correct answer", () => {
    expect(
      questionsEqual(stored, [
        { type: "MULTIPLE_CHOICE", prompt: "2 + 2?", answers: [{ text: "4" }, { text: "5", isCorrect: true }] },
      ])
    ).toBe(false);
  });

  it("spots added, removed and reordered questions", () => {
    expect(questionsEqual(stored, [])).toBe(false);
    expect(questionsEqual(stored, [stored[0], stored[0]])).toBe(false);
    const two = [stored[0], { type: "OPEN_ENDED", prompt: "Why?", points: 1, answers: [] }];
    expect(questionsEqual(two, [two[1], two[0]])).toBe(false);
  });

  it("treats two empty lists as equal", () => {
    expect(questionsEqual([], [])).toBe(true);
  });
});
