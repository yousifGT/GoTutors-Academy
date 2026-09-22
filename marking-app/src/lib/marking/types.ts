/**
 * Shapes shared by the marking engine.
 *
 * The split that matters here is `RawMark` vs `CheckedMark`. A raw mark is what
 * the model said. A checked mark is what we are willing to show a tutor: the
 * denominator comes from the mark scheme, the numerator is clamped into it, and
 * every reason we distrust the mark is recorded rather than smoothed over.
 */

/** One question of a mark scheme, as the engine needs it. */
export type SchemeQuestion = {
  id: string;
  label: string;
  order: number;
  prompt: string;
  expectedAnswer: string;
  marks: number;
  guidance?: string | null;
};

/** A previously marked answer, replayed to the model as a worked example. */
export type WorkedExample = {
  questionId: string | null;
  studentAnswer: string;
  awarded: number;
  available: number;
  examinerComment: string;
  source: "AI_CONFIRMED" | "HUMAN_CORRECTED";
  createdAt: Date;
};

/** Exactly what the model returns for one question. Not to be trusted yet. */
export type RawMark = {
  label: string;
  transcript: string;
  legible: boolean;
  awarded: number;
  comment: string;
  confidence: number;
};

/** Exactly what the model returns for a whole paper. Not to be trusted yet. */
export type RawMarking = {
  marks: RawMark[];
  strengths: string[];
  improvements: string[];
  overallComment: string;
  unreadable: boolean;
};

export type CheckedMark = RawMark & {
  /** Null when the model reported a question the scheme doesn't contain. */
  questionId: string | null;
  /** From the mark scheme, never from the model. */
  available: number;
  order: number;
  needsHuman: boolean;
  /** Human-readable reasons this mark can't stand on its own. */
  reasons: string[];
};

export type CheckedMarking = {
  marks: CheckedMark[];
  awarded: number;
  available: number;
  percentage: number;
  strengths: string[];
  improvements: string[];
  overallComment: string;
  /** The lowest per-question confidence — a paper is as weak as its worst mark. */
  confidence: number;
  needsHuman: boolean;
  reasons: string[];
};

/** A page of a photographed paper, ready to send to the model. */
export type PaperPage = {
  /** base64, no data: prefix, no newlines. */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};
