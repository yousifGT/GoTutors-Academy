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

  // Sub-position matches deliberately ignore the user's own role: a trainee
  // promoted to teacher of one field moves to an instructor role but keeps
  // their unfinished fields in subPositions and must keep receiving those
  // courses. Whole-role assignments still require the exact trainee role.
  const users = await prisma.user.findMany({
    where: {
      active: true,
      enrollments: { none: { courseId } },
      OR: [...byRole.entries()].map(([roleId, g]) =>
        g.wholeRole
          ? { roleId }
          : {
              role: { type: { in: ["TRAINEE", "INSTRUCTOR"] as const } },
              OR: [{ subPositions: { hasSome: g.subs } }, { subPosition: { in: g.subs } }],
            }
      ),
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

/**
 * Enrol an active trainee into every published course matching their role +
 * sub-positions. Also covers promoted teachers: an instructor who still has
 * trainee sub-positions keeps picking up those fields' courses (matched
 * through any trainee role, since their own role is no longer one).
 */
export async function syncUserEnrollments(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { type: true } } },
  });
  if (!user || !user.active) return 0;
  if (user.role.type !== "TRAINEE" && user.role.type !== "INSTRUCTOR") return 0;

  const names = effectiveSubPositions(user);
  if (user.role.type === "INSTRUCTOR" && names.length === 0) return 0;

  const courses = await prisma.course.findMany({
    where: {
      published: true,
      enrollments: { none: { userId } },
      roleAssignments: {
        some:
          user.role.type === "TRAINEE"
            ? {
                roleId: user.roleId,
                OR: [{ subPosition: null }, ...(names.length ? [{ subPosition: { in: names } }] : [])],
              }
            : { role: { type: "TRAINEE" }, subPosition: { in: names } },
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
