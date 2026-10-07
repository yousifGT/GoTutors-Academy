import type { Prisma, RoleType } from "@prisma/client";

/**
 * The open-ended quiz attempts waiting on this person's review: every one for a
 * super admin, their own courses' for an instructor — and never their own
 * attempt. Anyone can take a course now, the author and the super admins
 * included, and the review route refuses self-review; listing your own attempt
 * would only offer a button that fails.
 *
 * Shared by the queue page, both dashboards and both sidebar badges so the
 * count you see is the list you get.
 */
export function reviewQueueWhere(viewer: { id: string; roleType: RoleType }): Prisma.QuizAttemptWhereInput {
  return {
    needsReview: true,
    reviewedAt: null,
    userId: { not: viewer.id },
    ...(viewer.roleType === "SUPER_ADMIN" ? {} : { quiz: { lesson: { module: { course: { authorId: viewer.id } } } } }),
  };
}
