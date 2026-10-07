import { prisma } from "@/lib/prisma";
import { effectiveSubPositions, tutorTitleFor, tutoredFieldNames } from "@/lib/sub-positions";

/**
 * Assignment-driven enrolment: a published course assigned to a role is
 * enrolled automatically for everyone that assignment matches, and a person
 * picks up every matching published course the moment they get (or change)
 * their role or sub-positions. Sync only ever ADDS enrolments — when a course
 * or person stops matching, existing enrolments (and their progress) are kept;
 * admins remove them manually if needed. The Enrollment unique constraint plus
 * skipDuplicates guarantees no duplicates, however many assignments overlap.
 *
 * What an assignment means depends on the role it names:
 *
 *  - On a trainee-type role, a sub-position narrows it to that training field,
 *    and a row with no sub-position means every trainee on the role.
 *  - On any other role (centre admin, instructor, super admin) it means
 *    everyone on that role. Sub-positions are training fields, a trainee
 *    concept, so they carry no meaning there — and older data does contain
 *    admin-role rows with a field attached, written when the course form sent
 *    the trainee sub-positions for every selected role. Reading those as
 *    whole-role is what that person meant when they picked the role.
 *
 * Non-trainee roles used to be skipped entirely ("visibility only"), which is
 * why a course a super admin assigned to the heads of centre reached none of
 * them: nothing anywhere acted on that assignment.
 */

/** Whether an assignment row covers its whole role rather than one field. */
function isWholeRole(ra: { subPosition: string | null; role: { type: string } }): boolean {
  return ra.subPosition === null || ra.role.type !== "TRAINEE";
}

/** Enrol everyone an assignment matches into a published course. Returns how many were added. */
export async function syncCourseEnrollments(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { roleAssignments: { include: { role: { select: { type: true } } } } },
  });
  if (!course || !course.published) return 0;

  const byRole = new Map<string, { wholeRole: boolean; subs: string[] }>();
  for (const ra of course.roleAssignments) {
    const group = byRole.get(ra.roleId) ?? { wholeRole: false, subs: [] };
    if (isWholeRole(ra)) group.wholeRole = true;
    else group.subs.push(ra.subPosition as string);
    byRole.set(ra.roleId, group);
  }
  if (byRole.size === 0) return 0;

  // Sub-position matches deliberately ignore the user's own role: a trainee
  // promoted to teacher of one field moves to an instructor role but keeps
  // their unfinished fields in subPositions and must keep receiving those
  // courses. Whole-role assignments still require the exact role.
  const users = await prisma.user.findMany({
    where: {
      active: true,
      enrollments: { none: { courseId } },
      OR: [...byRole.entries()].map(([roleId, g]) =>
        g.wholeRole
          ? { roleId }
          : {
              role: { type: { in: ["TRAINEE", "INSTRUCTOR"] as const } },
              OR: [
                { subPositions: { hasSome: g.subs } },
                { subPosition: { in: g.subs } },
                // Someone already qualified to tutor the field must receive a
                // newly published course in it as well: their title stays, but
                // the field counts as retraining until they certify this one.
                // Matched on the stored TITLE, which is what teacherPositions holds.
                { teacherPositions: { hasSome: g.subs.map(tutorTitleFor) } },
              ],
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
 * Enrol an active user into every published course assigned to their role, and
 * — for anyone who trains — every course matching their training fields. A
 * promoted teacher keeps picking up their remaining fields' courses (matched
 * through any trainee role, since their own role is no longer one).
 */
export async function syncUserEnrollments(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { type: true } } },
  });
  if (!user || !user.active) return 0;

  // Only trainees and instructors hold training fields. Training fields plus the
  // fields they already tutor — a tutor keeps picking up new courses in their own
  // field, which is what makes a lapse recoverable.
  let names: string[] = [];
  if (user.role.type === "TRAINEE" || user.role.type === "INSTRUCTOR") {
    const knownFields = (await prisma.subPosition.findMany({ select: { name: true } })).map((r) => r.name);
    names = [
      ...new Set([...effectiveSubPositions(user), ...tutoredFieldNames(user.teacherPositions ?? [], knownFields)]),
    ];
  }

  // Their own role's whole-role courses (see isWholeRole: on a trainee role that
  // is the rows without a field; on any other role it is every row). Field
  // courses match by name across trainee-type roles, so a Tutor (a different
  // trainee-type role) keeps receiving their remaining fields' courses.
  const ownRole =
    user.role.type === "TRAINEE" ? { roleId: user.roleId, subPosition: null } : { roleId: user.roleId };
  const subMatch = names.length ? [{ role: { type: "TRAINEE" as const }, subPosition: { in: names } }] : [];
  const courses = await prisma.course.findMany({
    where: {
      published: true,
      enrollments: { none: { userId } },
      roleAssignments: { some: { OR: [ownRole, ...subMatch] } },
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
