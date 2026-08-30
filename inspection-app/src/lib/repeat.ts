/**
 * Findings a centre was told about last time and has not fixed.
 *
 * A first failure is a finding. The same failure at the next visit is a
 * different thing entirely: it says the debrief was heard and nothing was done.
 * That is the single most useful signal an inspection produces, and it is only
 * visible by comparing two visits — so it is worked out here rather than left
 * for someone to spot by eye.
 */

/** What the previous visit to this centre flagged. Question text, because the
 *  checklist may have been re-versioned since and ids would not survive that. */
export type PreviouslyFlagged = ReadonlySet<string>;

export function previouslyFlaggedSet(texts: string[]): PreviouslyFlagged {
  return new Set(texts);
}

/** Was this question flagged last time? True whatever it says this time — the
 *  inspector should know to look before they answer. */
export function wasFlaggedBefore(questionText: string, previous: PreviouslyFlagged): boolean {
  return previous.has(questionText);
}

/** Flagged last time and flagged again now: the finding that has not been fixed. */
export function isRepeat(
  questionText: string,
  bucket: string | null | undefined,
  previous: PreviouslyFlagged
): boolean {
  return bucket === "IMPROVE" && previous.has(questionText);
}

/** Every unfixed finding in a set of rows, in the order given. */
export function repeatsAmong<T extends { question: string; bucket: string }>(
  rows: T[],
  previous: PreviouslyFlagged
): T[] {
  return rows.filter((r) => isRepeat(r.question, r.bucket, previous));
}
