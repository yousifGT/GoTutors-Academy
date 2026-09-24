/**
 * Who a paper belongs to, for a list or a heading.
 *
 * A quick-marked paper has no student yet — that is the whole point of quick
 * marking — so every screen that shows one has to answer "whose is this?"
 * without a name. One function, so the answer is the same everywhere instead of
 * each page inventing its own placeholder.
 */

export type PaperOwner = {
  /** Absent when a query didn't ask for it, null when the paper has no student. */
  student?: { name: string; admissionNumber?: string } | null;
  reference?: string | null;
};

export function paperOwnerLabel(paper: PaperOwner): string {
  if (paper.student) return paper.student.name;
  const reference = paper.reference?.trim();
  return reference ? reference : "Unnamed paper";
}

/** A second line: the admission number, or a note that it isn't filed yet. */
export function paperOwnerHint(paper: PaperOwner): string | null {
  if (paper.student) return paper.student.admissionNumber ?? null;
  return "Not stored against a student";
}

/** True when this paper still needs filing. Drives the prompts and the counts. */
export function isUnstored(paper: { studentId: string | null }): boolean {
  return paper.studentId === null;
}
