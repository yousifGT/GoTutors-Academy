/**
 * Labels for a field's certificate date.
 *
 * `lastCertifiedAt` is the most recent certificate among a field's courses, which
 * is not the same thing as being qualified in the field. A trainee two courses
 * into a three-course field has a certificate date, and the modal printed
 * "Qualified 21/07/2026" beside "2/3 courses done" — telling a centre manager
 * someone was signed off when they were not.
 *
 * The date is worth showing either way; only the word in front of it changes.
 */
export function certificateDateLabel(field: { trained: boolean; retraining: boolean }): string {
  if (field.retraining) return "Last qualified";
  if (field.trained) return "Qualified";
  return "Latest certificate";
}
