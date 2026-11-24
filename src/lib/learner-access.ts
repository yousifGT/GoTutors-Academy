import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { effectiveSubPositions, tutoredFieldNames } from "@/lib/sub-positions";

/**
 * Who may LEARN a course — open it, watch its lessons, take its quizzes.
 *
 * A course is open to someone only while it is assigned to them NOW: to their
 * current role, or to a training field they currently hold (or tutor), or it is
 * a prerequisite of such a course. Being enrolled is not enough. Enrolment rows
 * are kept when a role or field is taken away — they carry the person's
 * progress, and it comes back intact if the role is given back — so an
 * enrolment on its own used to leave a demoted admin inside every admin course.
 *
 * Every learner page and route asks `canLearn`; lists of a person's courses
 * filter by `entitledCourseIds`. Nobody can enrol themselves: enrolments are
 * created only by assignment sync and by the bulk-enrol page, which is limited
 * to the same people.
 *
 * Super admins may open any course (preview), as before.
 */

export const LEARNER_SELECT = {
  id: true,
  roleId: true,
  active: true,
  subPosition: true,
  subPositions: true,
  teacherPositions: true,
  role: { select: { type: true } },
} as const;

export type Learner = {
  id: string;
  roleId: string;
  active: boolean;
  subPosition: string | null;
  subPositions: string[];
  teacherPositions?: string[] | null;
  role: { type: string };
};

/**
 * The course assignments that reach this person. Their own role's whole-role
 * assignments (on a trainee role, the rows without a field; on any other role,
 * every row — see isWholeRole in auto-enrol.ts) plus, for anyone who trains,
 * their fields matched by NAME across every trainee-typed role.
 */
export async function assignmentFilter(user: Learner): Promise<Prisma.CourseRoleAssignmentWhereInput> {
  // Only trainees and instructors hold training fields. Training fields plus the
  // fields they already tutor — a tutor keeps picking up new courses in their
  // own field, which is what makes a lapse recoverable.
  let names: string[] = [];
  if (user.role.type === "TRAINEE" || user.role.type === "INSTRUCTOR") {
    const knownFields = (await prisma.subPosition.findMany({ select: { name: true } })).map((r) => r.name);
    names = [
      ...new Set([...effectiveSubPositions(user), ...tutoredFieldNames(user.teacherPositions ?? [], knownFields)]),
    ];
  }
  const ownRole =
    user.role.type === "TRAINEE" ? { roleId: user.roleId, subPosition: null } : { roleId: user.roleId };
  const subMatch = names.length ? [{ role: { type: "TRAINEE" as const }, subPosition: { in: names } }] : [];
  return { OR: [ownRole, ...subMatch] };
}

/** Every prerequisite, direct or indirect, of the given courses (not the courses themselves). */
export async function prerequisiteClosure(courseIds: readonly string[]): Promise<string[]> {
  const seen = new Set(courseIds);
  const found: string[] = [];
  let frontier = [...seen];
  while (frontier.length > 0) {
    const edges = await prisma.coursePrerequisite.findMany({
      where: { courseId: { in: frontier } },
      select: { prerequisiteId: true },
    });
    frontier = [];
    for (const { prerequisiteId } of edges) {
      if (seen.has(prerequisiteId)) continue;
      seen.add(prerequisiteId);
      found.push(prerequisiteId);
      frontier.push(prerequisiteId);
    }
  }
  return found;
}

/**
 * The courses this person may learn right now: assigned to them, plus the
 * prerequisites of those (otherwise a prerequisite assigned to nobody would
 * lock its course forever). Empty for a deactivated or unknown user.
 * Published or not — publishing decides enrolment, not access.
 */
export async function entitledCourseIds(userId: string): Promise<Set<string>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: LEARNER_SELECT });
  if (!user || !user.active) return new Set();
  const direct = await prisma.course.findMany({
    where: { roleAssignments: { some: await assignmentFilter(user) } },
    select: { id: true },
  });
  const ids = direct.map((c) => c.id);
  return new Set([...ids, ...(await prerequisiteClosure(ids))]);
}

/**
 * May this person open the course: enrolled AND still assigned it. The single
 * gate for the course page, the lesson page, progress and quiz attempts.
 */
export async function canLearn(viewer: { id: string; roleType: string }, courseId: string): Promise<boolean> {
  if (viewer.roleType === "SUPER_ADMIN") return true;
  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: viewer.id, courseId } },
    select: { userId: true },
  });
  if (!enrolled) return false;
  return (await entitledCourseIds(viewer.id)).has(courseId);
}
