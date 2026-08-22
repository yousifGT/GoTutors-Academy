/**
 * Whether an incoming question list is the same as the stored one.
 *
 * Saving a lesson deletes and recreates every question and answer with fresh
 * ids, and `QuizAttempt.answers` is a plain JSON map keyed by those ids with no
 * foreign key — so the rewrite orphans the answers of any attempt still awaiting
 * review. The instructor then grades a submission that reads as empty and marks
 * it failed, and the trainee cannot resubmit because a new attempt is refused
 * while one is pending.
 *
 * The lesson editor resends the whole question list on every save, so a
 * title-only edit triggered the same rewrite. Comparing first means an unchanged
 * list is left alone entirely: innocent saves stop touching questions at all,
 * and only a genuine question edit has to be refused while attempts are pending.
 */

export type StoredQuestion = {
  type: string;
  prompt: string;
  points: number;
  answers: { text: string; isCorrect: boolean }[];
};

export type IncomingQuestion = {
  type: string;
  prompt: string;
  points?: number;
  answers?: { text: string; isCorrect?: boolean }[];
};

/** Defaults applied on write, so the comparison sees what would be stored. */
function normalise(q: IncomingQuestion): StoredQuestion {
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points ?? 1,
    answers: (q.answers ?? []).map((a) => ({ text: a.text, isCorrect: !!a.isCorrect })),
  };
}

export function questionsEqual(stored: readonly StoredQuestion[], incoming: readonly IncomingQuestion[]): boolean {
  if (stored.length !== incoming.length) return false;
  // Order is meaningful — it is what trainees see — so this is deliberately
  // position-by-position rather than a set comparison.
  return stored.every((s, i) => {
    const n = normalise(incoming[i]);
    if (s.type !== n.type || s.prompt !== n.prompt || s.points !== n.points) return false;
    if (s.answers.length !== n.answers.length) return false;
    return s.answers.every((a, j) => a.text === n.answers[j].text && a.isCorrect === n.answers[j].isCorrect);
  });
}
