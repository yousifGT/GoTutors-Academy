import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildPaperInstruction, buildSchemeContext, renderExamples, renderScheme } from "./prompt";
import type { SchemeQuestion, WorkedExample } from "./types";

const questions: SchemeQuestion[] = [
  { id: "q1", label: "1", order: 0, prompt: "2+2", expectedAnswer: "4", marks: 1 },
  { id: "q2", label: "2a", order: 1, prompt: "3/4 of 60", expectedAnswer: "45", marks: 2, guidance: "1 for method." },
];

describe("renderScheme", () => {
  it("includes every question, its marks, its answer and its guidance", () => {
    const text = renderScheme(questions);
    expect(text).toContain("Question 1 (1 mark)");
    expect(text).toContain("Question 2a (2 marks)");
    expect(text).toContain("Expected answer: 45");
    expect(text).toContain("Marking guidance: 1 for method.");
  });

  it("renders in scheme order regardless of the order it is given", () => {
    const text = renderScheme([questions[1], questions[0]]);
    expect(text.indexOf("Question 1 ")).toBeLessThan(text.indexOf("Question 2a"));
  });

  it("says so rather than producing an empty prompt", () => {
    expect(renderScheme([])).toContain("no questions");
  });
});

describe("renderExamples", () => {
  const example = (over: Partial<WorkedExample> = {}): WorkedExample => ({
    questionId: "q1",
    studentAnswer: "4",
    awarded: 1,
    available: 1,
    examinerComment: "Correct.",
    source: "HUMAN_CORRECTED",
    createdAt: new Date("2026-01-01"),
    ...over,
  });

  it("puts each example under its own question", () => {
    const text = renderExamples(questions, [example(), example({ questionId: "q2", studentAnswer: "45", awarded: 2, available: 2 })]);
    expect(text).toContain("Question 1 — how this was marked before");
    expect(text).toContain("Question 2a — how this was marked before");
    expect(text).toContain("Marked: 2/2");
  });

  it("is empty when there is nothing learned yet, so no empty heading is emitted", () => {
    expect(renderExamples(questions, [])).toBe("");
  });
});

describe("buildSchemeContext", () => {
  it("holds the scheme and its examples — everything that repeats across papers", () => {
    const text = buildSchemeContext({
      schemeTitle: "Paper 1",
      subject: "Maths",
      level: "Year 6",
      questions,
      examples: [],
    });
    expect(text).toContain("Mark scheme: Paper 1");
    expect(text).toContain("Subject: Maths (Year 6)");
    expect(text).toContain("Question 2a");
  });

  it("is byte-identical for two different papers on the same scheme", () => {
    // This is the whole point: the cache is a prefix match, so anything that
    // varies per paper must not be in here.
    const args = { schemeTitle: "Paper 1", subject: "Maths", questions, examples: [] };
    expect(buildSchemeContext(args)).toBe(buildSchemeContext(args));
  });

  it("carries nothing about the paper being marked", () => {
    const text = buildSchemeContext({ schemeTitle: "P", subject: "Maths", questions, examples: [] });
    expect(text).not.toMatch(/image|page order|student's paper/i);
  });
});

describe("buildPaperInstruction", () => {
  it("reads correctly for one page and for several", () => {
    expect(buildPaperInstruction(1)).toContain("1 image above is the student's paper");
    expect(buildPaperInstruction(3)).toContain("3 images above are the student's paper");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("tells the reader to refuse rather than guess, which is the whole safety property", () => {
    expect(SYSTEM_PROMPT).toContain("Do not guess a mark");
    expect(SYSTEM_PROMPT).toContain("transcribed verbatim".slice(0, 0) + "Transcribe what the student actually wrote");
  });

  it("puts the centre's own examples above the model's instinct", () => {
    expect(SYSTEM_PROMPT).toContain("Follow them over your own instinct");
  });
});
