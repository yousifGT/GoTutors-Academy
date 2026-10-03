import { normaliseLabel } from "../marking/scoring";
import type { CheckedMarking } from "../marking/types";

/**
 * How a model's marking compares with a tutor's, on papers a tutor has already
 * marked by hand.
 *
 * The number this exists to produce is **wrong marks that nobody would have
 * checked**: a mark the model got wrong, on a paper it was confident enough to
 * send out without a person looking. Everything else is secondary. A model that
 * is often unsure costs tutor time; a model that is confidently wrong puts a
 * wrong mark in front of a parent.
 *
 * Pure: no network, no database. The bench script does the I/O.
 */

/** One question of the answer key — what the tutor decided. */
export type KeyMark = { label: string; awarded: number; available: number; transcript: string };

export type QuestionScore = {
  label: string;
  available: number;
  tutor: number;
  /** Null when the model produced nothing usable for this paper. */
  model: number | null;
  right: boolean;
  withinOne: boolean;
  /** The model itself said this question needs a person. */
  flagged: boolean;
  /** 0–1 agreement between what the tutor and the model read. Null when the tutor read nothing. */
  reading: number | null;
  tutorTranscript: string;
  modelTranscript: string | null;
};

export type PaperScore = {
  paperId: string;
  failed: boolean;
  failure: string | null;
  questions: QuestionScore[];
  tutorTotal: number;
  modelTotal: number | null;
  /** A person would have looked at this paper: it failed, or the model said it needed one. */
  toPerson: boolean;
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Two transcripts of the same handwriting, made comparable.
 *
 * Spacing in handwriting is arbitrary — "6.4x5=30" and "6.4 x 5 = 30" are the
 * same answer — so whitespace goes. Case goes. The maths symbols a reader might
 * render either way are folded together. Punctuation stays: "6.4" and "64" are
 * not the same answer.
 */
export function normaliseTranscript(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[×✕✖]/g, "x")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

/** Edit distance, capped so one runaway transcript can't stall the run. */
function levenshtein(a: string, b: string): number {
  const x = a.slice(0, 2000);
  const y = b.slice(0, 2000);
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** 1 for the same answer, 0 for nothing in common. */
export function readingAgreement(tutor: string, model: string): number {
  const a = normaliseTranscript(tutor);
  const b = normaliseTranscript(model);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// ---------------------------------------------------------------------------
// One paper
// ---------------------------------------------------------------------------

/**
 * Score one paper.
 *
 * `checked` is the model's marking *after* the app's own checks — clamped,
 * flagged, missing questions filled in — because that is what a tutor would
 * actually have seen. Scoring the raw reply would credit a model for marks the
 * app would never have shown.
 *
 * A failure scores nothing: every question counts as wrong and as sent to a
 * person, which is exactly what the app would do with it. A flaky model is
 * never rewarded for the papers it couldn't mark.
 */
export function scorePaper(
  paperId: string,
  key: KeyMark[],
  outcome: { ok: true; checked: CheckedMarking } | { ok: false; reason: string }
): PaperScore {
  const scored = key.filter((k) => k.available > 0);
  const tutorTotal = scored.reduce((n, k) => n + k.awarded, 0);

  if (!outcome.ok) {
    return {
      paperId,
      failed: true,
      failure: outcome.reason,
      tutorTotal,
      modelTotal: null,
      toPerson: true,
      questions: scored.map((k) => ({
        label: k.label,
        available: k.available,
        tutor: k.awarded,
        model: null,
        right: false,
        withinOne: false,
        flagged: true,
        reading: k.transcript.trim() ? 0 : null,
        tutorTranscript: k.transcript,
        modelTranscript: null,
      })),
    };
  }

  const byLabel = new Map(outcome.checked.marks.map((m) => [normaliseLabel(m.label), m]));
  const questions = scored.map((k): QuestionScore => {
    const m = byLabel.get(normaliseLabel(k.label));
    const model = m ? m.awarded : 0;
    return {
      label: k.label,
      available: k.available,
      tutor: k.awarded,
      model,
      right: model === k.awarded,
      withinOne: Math.abs(model - k.awarded) <= 1,
      // A question the model never answered is one the app would have flagged.
      flagged: m ? m.needsHuman : true,
      reading: k.transcript.trim() ? readingAgreement(k.transcript, m?.transcript ?? "") : null,
      tutorTranscript: k.transcript,
      modelTranscript: m?.transcript ?? "",
    };
  });

  return {
    paperId,
    failed: false,
    failure: null,
    questions,
    tutorTotal,
    modelTotal: questions.reduce((n, q) => n + (q.model ?? 0), 0),
    toPerson: outcome.checked.needsHuman,
  };
}

// ---------------------------------------------------------------------------
// One model, across the whole answer key
// ---------------------------------------------------------------------------

export type ModelSummary = {
  papers: number;
  questions: number;
  /** Questions where the model's mark matched the tutor's exactly. */
  marksRight: number;
  marksWithinOne: number;
  /** Papers where the model's total matched the tutor's total. */
  totalsRight: number;
  /**
   * Questions the model got wrong, on papers it would have sent out without a
   * person looking. The number that matters most.
   */
  wrongAndUnchecked: number;
  /** Papers a person would have had to look at — tutor workload. */
  papersToPerson: number;
  /** Of the questions the model flagged, how many it had actually got wrong. */
  flagsThatCaughtAnError: number | null;
  /** Mean reading agreement over questions where the tutor read something. */
  reading: number | null;
  failedPapers: number;
};

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function summarise(papers: PaperScore[]): ModelSummary {
  const questions = papers.flatMap((p) => p.questions);
  const unchecked = papers.filter((p) => !p.toPerson).flatMap((p) => p.questions);
  const flagged = questions.filter((q) => q.flagged);
  const readable = questions.filter((q) => q.reading !== null);

  return {
    papers: papers.length,
    questions: questions.length,
    marksRight: ratio(questions.filter((q) => q.right).length, questions.length),
    marksWithinOne: ratio(questions.filter((q) => q.withinOne).length, questions.length),
    totalsRight: ratio(papers.filter((p) => !p.failed && p.modelTotal === p.tutorTotal).length, papers.length),
    wrongAndUnchecked: ratio(unchecked.filter((q) => !q.right).length, questions.length),
    papersToPerson: ratio(papers.filter((p) => p.toPerson).length, papers.length),
    flagsThatCaughtAnError: flagged.length ? ratio(flagged.filter((q) => !q.right).length, flagged.length) : null,
    reading: readable.length ? readable.reduce((n, q) => n + (q.reading ?? 0), 0) / readable.length : null,
    failedPapers: papers.filter((p) => p.failed).length,
  };
}

/**
 * The questions models disagreed with the tutor on most, across every model.
 *
 * When every model gets the same question wrong, the model usually isn't the
 * problem: the mark scheme's guidance for that question is thin, or the tutor's
 * mark is the odd one out. Either way it's worth a look.
 */
export function hardestQuestions(
  byModel: Record<string, PaperScore[]>,
  limit = 10
): { paperId: string; label: string; tutor: number; available: number; wrongIn: number; of: number }[] {
  const tally = new Map<string, { paperId: string; label: string; tutor: number; available: number; wrongIn: number; of: number }>();
  for (const papers of Object.values(byModel)) {
    for (const paper of papers) {
      for (const q of paper.questions) {
        const id = `${paper.paperId}\u0000${q.label}`;
        const row = tally.get(id) ?? { paperId: paper.paperId, label: q.label, tutor: q.tutor, available: q.available, wrongIn: 0, of: 0 };
        row.of++;
        if (!q.right) row.wrongIn++;
        tally.set(id, row);
      }
    }
  }
  return [...tally.values()]
    .filter((r) => r.wrongIn > 0)
    .sort((a, b) => b.wrongIn / b.of - a.wrongIn / a.of || b.wrongIn - a.wrongIn)
    .slice(0, limit);
}
