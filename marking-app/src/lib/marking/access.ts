import type { Prisma } from "@prisma/client";
import type { Viewer } from "@/lib/session";

/**
 * Who can see whose marked work.
 *
 * Two rules, in this order, and both matter:
 *
 *  1. Nothing crosses an organisation. Every filter below starts with the
 *     viewer's own organisationId — not as a nicety but as the only thing
 *     standing between one centre's children and another's.
 *  2. Inside an organisation, an ADMIN sees everything and a MARKER sees their
 *     own students and their own uploads.
 *
 * These are plain functions of the viewer so they can be tested without a
 * database, and so there is exactly one place to read when asking "who can see
 * this?".
 */

export function studentScope(viewer: Viewer): Prisma.StudentWhereInput {
  const base = { organisationId: viewer.organisationId };
  return viewer.role === "ADMIN" ? base : { ...base, tutorId: viewer.id };
}

/**
 * Mark schemes are shared more freely than students: a scheme is a teaching
 * resource, not personal data, and a centre that has typed up the Year 6 paper
 * once should not type it up eleven more times. Sharing is still per scheme,
 * and never leaves the organisation.
 */
export function schemeScope(viewer: Viewer): Prisma.MarkSchemeWhereInput {
  const base = { organisationId: viewer.organisationId };
  if (viewer.role === "ADMIN") return base;
  return { ...base, OR: [{ ownerId: viewer.id }, { shared: true }] };
}

export function submissionScope(viewer: Viewer): Prisma.SubmissionWhereInput {
  const base = { organisationId: viewer.organisationId };
  return viewer.role === "ADMIN" ? base : { ...base, uploadedById: viewer.id };
}

/** Whether this viewer may correct marks on a submission they can already see. */
export function canReviewSubmission(
  viewer: Viewer,
  submission: { organisationId: string; uploadedById: string }
): boolean {
  if (submission.organisationId !== viewer.organisationId) return false;
  if (viewer.role === "ADMIN") return true;
  // The person who photographed the paper can always mark it by hand. That is
  // the whole point of the human fallback — it must not depend on a second
  // permission the tutor standing in front of the child might not have.
  return submission.uploadedById === viewer.id;
}

/** Whether this viewer may edit a mark scheme (as opposed to marking against it). */
export function canEditScheme(viewer: Viewer, scheme: { organisationId: string; ownerId: string }): boolean {
  if (scheme.organisationId !== viewer.organisationId) return false;
  // A shared scheme is readable by the centre, not writable by it: one tutor's
  // edit would silently change how everyone else's papers are marked.
  return viewer.role === "ADMIN" || scheme.ownerId === viewer.id;
}
