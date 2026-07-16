import { prisma } from "@/lib/prisma";
import { effectiveSubPositions } from "@/lib/sub-positions";

/**
 * Assignment-driven enrolment: a published course assigned to trainee
 * sub-positions is enrolled automatically for every matching trainee, and a
 * trainee picks up every matching published course the moment they get (or
 * change) their sub-positions. Sync only ever ADDS enrolments — when a course
 * or trainee stops matching, existing enrolments (and their progress) are
 * kept; admins remove them manually if needed. The Enrollment unique
 * constraint plus skipDuplicates guarantees no duplicates, however many
 * sub-positions a trainee and a course have in common.
 */

/** Enrol every matching active trainee into a published course. Returns how many were added. */
export async function syncCourseEnrollments(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { roleAssignments: { include: { role: { select: { type: true } } } } },
  });
  if (!course || !course.published) return 0;

  // Auto-enrolment is a trainee concept — assignments to admin/instructor
  // roles keep controlling visibility only.
  const byRole = new Map<string, { wholeRole: boolean; subs: string[] }>();
  for (const ra of course.roleAssignments) {
    if (ra.role.type !== "TRAINEE") continue;
    const group = byRole.get(ra.roleId) ?? { wholeRole: false, subs: [] };
    if (ra.subPosition === null) group.wholeRole = true;
    else group.subs.push(ra.subPosition);
    byRole.set(ra.roleId, group);
  }
  if (byRole.size === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      active: true,
      enrollments: { none: { courseId } },
      OR: [...byRole.entries()].map(([roleId, g]) => ({
        roleId,
        ...(g.wholeRole
          ? {}
          : { OR: [{ subPositions: { hasSome: g.subs } }, { subPosition: { in: g.subs } }] }),
      })),
    },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const result = await prisma.enrollment.createMany({
    data: users.map((u) => ({ userId: u.id, courseId })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Enrol an active trainee into every published course matching their role + sub-positions. */
export async function syncUserEnrollments(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { type: true } } },
  });
  if (!user || !user.active || user.role.type !== "TRAINEE") return 0;

  const names = effectiveSubPositions(user);
  const courses = await prisma.course.findMany({
    where: {
      published: true,
      enrollments: { none: { userId } },
      roleAssignments: {
        some: {
          roleId: user.roleId,
          OR: [{ subPosition: null }, ...(names.length ? [{ subPosition: { in: names } }] : [])],
        },
      },
    },
    select: { id: true },
  });
  if (courses.length === 0) return 0;

  const result = await prisma.enrollment.createMany({
    data: courses.map((c) => ({ userId, courseId: c.id })),
    skipDuplicates: true,
  });
  return result.count;
}
