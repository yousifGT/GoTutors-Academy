import type { CheckedMark, CheckedMarking, RawMarking, SchemeQuestion } from "./types";

/**
 * Turning what the model said into what we are willing to show.
 *
 * Everything in here is pure so it can be tested without a model, a database or
 * a browser. The rule it exists to enforce: a mark the engine is not sure about
 * must reach a human, not a child's report. Silence is cheap; a confidently
 * wrong mark on someone's work is not.
 */

/** Below this, a mark goes to a human no matter what it says. */
export const CONFIDENCE_FLOOR = 0.6;

/** A mark is worth showing only if the reader could actually read the answer. */
function reasonsFor(
  awardedRaw: number,
  available: number,
  legible: boolean,
  confidence: number,
  transcript: string
): string[] {
  const reasons: string[] = [];
  if (!legible) reasons.push("the handwriting could not be read");
  if (!transcript.trim()) reasons.push("no answer was found for this question");
  if (confidence < CONFIDENCE_FLOOR) reasons.push(`low confidence (${Math.round(confidence * 100)}%)`);
  // A numerator outside the scheme's range means the reader lost track of which
  // question it was on. Clamping hides that, so record it before clamping.
  if (awardedRaw < 0 || awardedRaw > available)
    reasons.push(`awarded ${awardedRaw} of a possible ${available}`);
  if (!Number.isInteger(awardedRaw)) reasons.push("a part mark was awarded, which this scheme does not support");
  return reasons;
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), max);
}

/**
 * Pair the model's marks with the mark scheme and decide what stands.
 *
 * The scheme is the spine: one checked mark per scheme question, in scheme
 * order, whether or not the model produced one. A question the model skipped is
 * a zero that needs a human, not a question that quietly vanishes from the
 * total — the denominator has to be the whole paper or the percentage lies.
 */
export function checkMarking(raw: RawMarking, questions: SchemeQuestion[]): CheckedMarking {
  const byLabel = new Map(raw.marks.map((m) => [normaliseLabel(m.label), m]));
  const used = new Set<string>();
  const marks: CheckedMark[] = [];

  for (const q of questions) {
    const key = normaliseLabel(q.label);
    const m = byLabel.get(key);
    if (m) used.add(key);

    const available = Math.max(0, Math.round(q.marks));
    if (!m) {
      marks.push({
        questionId: q.id,
        label: q.label,
        order: q.order,
        transcript: "",
        legible: false,
        awarded: 0,
        available,
        comment: "",
        confidence: 0,
        needsHuman: true,
        reasons: ["the reader did not return a mark for this question"],
      });
      continue;
    }

    const confidence = Number.isFinite(m.confidence) ? Math.min(Math.max(m.confidence, 0), 1) : 0;
    const reasons = reasonsFor(m.awarded, available, m.legible, confidence, m.transcript);
    marks.push({
      questionId: q.id,
      label: q.label,
      order: q.order,
      transcript: m.transcript,
      legible: m.legible,
      awarded: clamp(m.awarded, available),
      available,
      comment: m.comment,
      confidence,
      needsHuman: reasons.length > 0,
      reasons,
    });
  }

  // A mark for a question the scheme doesn't have means the reader misread the
  // paper's structure. Keep it (a human needs to see what it thought it saw)
  // but give it no marks, so it can't move the score.
  for (const m of raw.marks) {
    const key = normaliseLabel(m.label);
    if (used.has(key) || questions.some((q) => normaliseLabel(q.label) === key)) continue;
    marks.push({
      questionId: null,
      label: m.label,
      order: questions.length + marks.length,
      transcript: m.transcript,
      legible: m.legible,
      awarded: 0,
      available: 0,
      comment: m.comment,
      confidence: 0,
      needsHuman: true,
      reasons: [`"${m.label}" is not a question in this mark scheme`],
    });
  }

  marks.sort((a, b) => a.order - b.order);

  const awarded = marks.reduce((sum, m) => sum + m.awarded, 0);
  const available = marks.reduce((sum, m) => sum + m.available, 0);
  const reasons: string[] = [];
  if (raw.unreadable) reasons.push("the reader could not make out the paper");
  if (questions.length === 0) reasons.push("the mark scheme has no questions");
  const flagged = marks.filter((m) => m.needsHuman);
  if (flagged.length > 0)
    reasons.push(`${flagged.length} of ${marks.length} question${marks.length === 1 ? "" : "s"} need checking`);

  return {
    marks,
    awarded,
    available,
    percentage: percentageOf(awarded, available),
    strengths: raw.strengths.filter((s) => s.trim().length > 0),
    improvements: raw.improvements.filter((s) => s.trim().length > 0),
    overallComment: raw.overallComment.trim(),
    // The paper is only as trustworthy as its least trustworthy question.
    confidence: marks.length === 0 ? 0 : Math.min(...marks.map((m) => m.confidence)),
    needsHuman: reasons.length > 0,
    reasons,
  };
}

/**
 * "2b", "Q2b", "2 b" and "2B" are the same question.
 *
 * The model reads the label off the page, where it is printed however the exam
 * board felt like printing it, and the scheme holds whatever the tutor typed.
 * Matching those literally sent perfectly good marks to the unmatched pile.
 */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/^(question|q)\s*/i, "")
    .replace(/[\s.)\]]+/g, "")
    .trim();
}

/** Whole percent, 0 when nothing is available (rather than NaN). */
export function percentageOf(awarded: number, available: number): number {
  if (available <= 0) return 0;
  return Math.round((awarded / available) * 100);
}
