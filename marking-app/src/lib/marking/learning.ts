import type { ExampleSource } from "@prisma/client";

/**
 * Turning a human review into something the next paper can learn from.
 *
 * The pure half lives here so the rule — what is worth keeping, and what it
 * counts as — can be tested without a database. The rule itself:
 *
 *  - a mark a human CHANGED is a correction, and is the most valuable thing
 *    this system produces. Keep it.
 *  - a mark a human LOOKED AT and left alone is a confirmation. Keep it too,
 *    but it ranks below corrections when prompts are built.
 *  - a mark with no transcript teaches nothing — there is no student answer to
 *    attach the judgement to. Drop it.
 *  - a mark not tied to a scheme question can't be retrieved later. Drop it.
 */

export type ReviewedMark = {
  questionId: string | null;
  /** What the student wrote, as transcribed (and possibly corrected by the human). */
  transcript: string;
  awarded: number;
  available: number;
  comment: string;
  /** True when the human changed the mark or the comment. */
  edited: boolean;
};

export type ExampleDraft = {
  questionId: string;
  studentAnswer: string;
  awarded: number;
  available: number;
  examinerComment: string;
  source: ExampleSource;
};

export function examplesFromReview(marks: ReviewedMark[]): ExampleDraft[] {
  const drafts: ExampleDraft[] = [];
  for (const mark of marks) {
    if (!mark.questionId) continue;
    const answer = mark.transcript.trim();
    if (!answer) continue;
    drafts.push({
      questionId: mark.questionId,
      studentAnswer: answer,
      awarded: mark.awarded,
      available: mark.available,
      examinerComment: mark.comment.trim(),
      source: mark.edited ? "HUMAN_CORRECTED" : "AI_CONFIRMED",
    });
  }
  return drafts;
}

/**
 * Did this review actually change anything?
 *
 * Used for the audit trail and for the "corrections" counter a tutor sees, so
 * "the AI agreed with me on 18 of 20" is a number rather than a feeling.
 */
export function countCorrections(marks: ReviewedMark[]): { corrected: number; confirmed: number } {
  let corrected = 0;
  let confirmed = 0;
  for (const mark of marks) (mark.edited ? corrected++ : confirmed++);
  return { corrected, confirmed };
}
