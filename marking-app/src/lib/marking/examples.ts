import type { WorkedExample } from "./types";

/**
 * How this thing "learns".
 *
 * There is no training run and no fine-tuning. Every paper a human checks
 * leaves behind worked examples — this answer, this many marks, this comment —
 * and the next paper on the same question is marked with those examples in
 * front of the model. So it converges on how *this centre's* tutors mark,
 * question by question, and a correction made once stops being made twice.
 *
 * Two rules do most of the work:
 *  - a correction outranks a confirmation, always. A human only bothers to
 *    change a mark when the engine got it wrong, so that example carries the
 *    information; a confirmation only says "this one was fine".
 *  - recent outranks old, so a tutor who changes how they mark a question is
 *    followed rather than argued with.
 */

/** How many examples per question go into a prompt before it stops helping. */
export const EXAMPLES_PER_QUESTION = 4;

export function selectExamples(
  pool: WorkedExample[],
  perQuestion: number = EXAMPLES_PER_QUESTION
): Map<string, WorkedExample[]> {
  const byQuestion = new Map<string, WorkedExample[]>();
  for (const example of pool) {
    if (!example.questionId) continue; // an example with no question teaches nothing
    const list = byQuestion.get(example.questionId) ?? [];
    list.push(example);
    byQuestion.set(example.questionId, list);
  }

  for (const [questionId, list] of byQuestion) {
    list.sort(compareExamples);
    byQuestion.set(questionId, list.slice(0, Math.max(0, perQuestion)));
  }
  return byQuestion;
}

function compareExamples(a: WorkedExample, b: WorkedExample): number {
  const rank = (e: WorkedExample) => (e.source === "HUMAN_CORRECTED" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/**
 * Spread the examples across the mark range where we can.
 *
 * Four examples that all award full marks teach the model to award full marks.
 * Preferring one of each score first — still corrections before confirmations
 * within a score — keeps the range of the scheme visible.
 */
export function spreadByScore(examples: WorkedExample[], limit: number): WorkedExample[] {
  const byScore = new Map<number, WorkedExample[]>();
  for (const e of [...examples].sort(compareExamples)) {
    const list = byScore.get(e.awarded) ?? [];
    list.push(e);
    byScore.set(e.awarded, list);
  }
  const scores = [...byScore.keys()].sort((a, b) => a - b);
  const picked: WorkedExample[] = [];
  let round = 0;
  while (picked.length < limit) {
    const before = picked.length;
    for (const score of scores) {
      const list = byScore.get(score)!;
      if (round < list.length && picked.length < limit) picked.push(list[round]);
    }
    if (picked.length === before) break; // nothing left to take
    round += 1;
  }
  return picked;
}
