import { describe, it, expect } from "vitest";
import { hardestQuestions, normaliseTranscript, readingAgreement, scorePaper, summarise, type KeyMark } from "./score";
import type { CheckedMark, CheckedMarking } from "../marking/types";

const key: KeyMark[] = [
  { label: "1", awarded: 2, available: 2, transcript: "15 x 3 = 45" },
  { label: "2", awarded: 1, available: 1, transcript: "4700" },
  { label: "3a", awarded: 1, available: 2, transcript: "6.4 x 5 = 30" },
];

function mark(label: string, awarded: number, over: Partial<CheckedMark> = {}): CheckedMark {
  return {
    questionId: label,
    label,
    order: 0,
    transcript: "",
    legible: true,
    awarded,
    available: 2,
    comment: "",
    confidence: 0.95,
    needsHuman: false,
    reasons: [],
    ...over,
  };
}

function marking(marks: CheckedMark[], needsHuman = marks.some((m) => m.needsHuman)): CheckedMarking {
  return {
    marks,
    awarded: marks.reduce((n, m) => n + m.awarded, 0),
    available: 5,
    percentage: 0,
    strengths: [],
    improvements: [],
    overallComment: "",
    confidence: 0.9,
    needsHuman,
    reasons: [],
  };
}

describe("reading agreement", () => {
  it("ignores the spacing handwriting never agrees on", () => {
    expect(readingAgreement("6.4 x 5 = 30", "6.4x5=30")).toBe(1);
  });

  it("treats the two ways of writing times and minus as the same", () => {
    expect(normaliseTranscript("6 × 5 − 2")).toBe(normaliseTranscript("6 x 5 - 2"));
  });

  it("does not treat 6.4 and 64 as the same answer", () => {
    expect(readingAgreement("6.4", "64")).toBeLessThan(1);
  });

  it("is 0 when the model read nothing the tutor could see", () => {
    expect(readingAgreement("45", "")).toBe(0);
  });

  it("is proportional for a near-miss", () => {
    expect(readingAgreement("4700", "4760")).toBeCloseTo(0.75);
  });
});

describe("scorePaper", () => {
  it("credits a mark that matches the tutor's exactly", () => {
    const p = scorePaper("p1", key, { ok: true, checked: marking([mark("1", 2), mark("2", 1), mark("3a", 1)]) });
    expect(p.questions.every((q) => q.right)).toBe(true);
    expect(p.modelTotal).toBe(4);
    expect(p.tutorTotal).toBe(4);
    expect(p.toPerson).toBe(false);
  });

  it("counts within-one separately from right", () => {
    const p = scorePaper("p1", key, { ok: true, checked: marking([mark("1", 1), mark("2", 1), mark("3a", 1)]) });
    const q1 = p.questions.find((q) => q.label === "1")!;
    expect(q1.right).toBe(false);
    expect(q1.withinOne).toBe(true);
  });

  it("matches labels however the reader wrote them", () => {
    const p = scorePaper("p1", key, { ok: true, checked: marking([mark("Q1", 2), mark("2", 1), mark("3A", 1)]) });
    expect(p.questions.every((q) => q.right)).toBe(true);
  });

  it("treats a question the model skipped as wrong and flagged, as the app would", () => {
    const p = scorePaper("p1", key, { ok: true, checked: marking([mark("1", 2), mark("2", 1)]) });
    const q3 = p.questions.find((q) => q.label === "3a")!;
    expect(q3.right).toBe(false);
    expect(q3.flagged).toBe(true);
  });

  it("never rewards a failed paper", () => {
    const p = scorePaper("p1", key, { ok: false, reason: "timed out" });
    expect(p.failed).toBe(true);
    expect(p.toPerson).toBe(true);
    expect(p.questions.every((q) => !q.right && q.flagged && q.model === null)).toBe(true);
    expect(p.questions.every((q) => q.reading === 0)).toBe(true);
  });

  it("leaves out questions worth nothing, which are the reader's strays", () => {
    const p = scorePaper("p1", [...key, { label: "99", awarded: 0, available: 0, transcript: "" }], {
      ok: true,
      checked: marking([mark("1", 2), mark("2", 1), mark("3a", 1)]),
    });
    expect(p.questions).toHaveLength(3);
  });
});

describe("summarise", () => {
  it("counts a wrong mark as unchecked only on a paper nobody would have looked at", () => {
    // Paper A: confident and wrong on Q1 — that mark goes out unchecked.
    const a = scorePaper("a", key, { ok: true, checked: marking([mark("1", 0), mark("2", 1), mark("3a", 1)], false) });
    // Paper B: also wrong on Q1, but it flagged the paper — a person sees it.
    const b = scorePaper("b", key, {
      ok: true,
      checked: marking([mark("1", 0, { needsHuman: true }), mark("2", 1), mark("3a", 1)], true),
    });
    const s = summarise([a, b]);
    // One unchecked wrong mark out of six questions.
    expect(s.wrongAndUnchecked).toBeCloseTo(1 / 6);
    expect(s.papersToPerson).toBe(0.5);
    expect(s.marksRight).toBeCloseTo(4 / 6);
  });

  it("says how often a flag caught a real mistake", () => {
    const p = scorePaper("p", key, {
      ok: true,
      checked: marking([mark("1", 0, { needsHuman: true }), mark("2", 1, { needsHuman: true }), mark("3a", 1)], true),
    });
    // Two flags; one on a wrong mark, one on a right one.
    expect(summarise([p]).flagsThatCaughtAnError).toBe(0.5);
  });

  it("puts failures in the totals rather than quietly leaving them out", () => {
    const ok = scorePaper("ok", key, { ok: true, checked: marking([mark("1", 2), mark("2", 1), mark("3a", 1)]) });
    const bad = scorePaper("bad", key, { ok: false, reason: "refused" });
    const s = summarise([ok, bad]);
    expect(s.failedPapers).toBe(1);
    expect(s.marksRight).toBe(0.5);
    expect(s.totalsRight).toBe(0.5);
    // A failure goes to a person, so it is never an unchecked wrong mark.
    expect(s.wrongAndUnchecked).toBe(0);
  });

  it("reports reading only over questions where the tutor read something", () => {
    const blank: KeyMark[] = [{ label: "1", awarded: 0, available: 2, transcript: "" }];
    const p = scorePaper("p", blank, { ok: true, checked: marking([mark("1", 0, { transcript: "" })]) });
    expect(summarise([p]).reading).toBeNull();
  });
});

describe("hardestQuestions", () => {
  it("ranks the questions most models got wrong first", () => {
    const right = marking([mark("1", 2), mark("2", 1), mark("3a", 1)]);
    const wrongOn3a = marking([mark("1", 2), mark("2", 1), mark("3a", 2)]);
    const byModel = {
      a: [scorePaper("p", key, { ok: true, checked: wrongOn3a })],
      b: [scorePaper("p", key, { ok: true, checked: wrongOn3a })],
      c: [scorePaper("p", key, { ok: true, checked: right })],
    };
    const hardest = hardestQuestions(byModel);
    expect(hardest[0]).toMatchObject({ label: "3a", wrongIn: 2, of: 3 });
    expect(hardest.some((h) => h.label === "1")).toBe(false);
  });
});
