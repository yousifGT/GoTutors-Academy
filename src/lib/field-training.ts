import { prisma } from "@/lib/prisma";
import { effectiveSubPositions } from "@/lib/sub-positions";

/**
 * Per-field ("sub-position") training status. A user is trained IN A FIELD when
 * they hold a certificate for every published course assigned to that field —
 * so someone can be a fully-trained Maths Tutor while still an English Tutor
 * trainee. Fields with no courses defined yet are never "trained" (there is
 * nothing to have finished).
 */
export type FieldStatus = {
  name: string;
  total: number; // published courses this field requires
  done: number; // certificates held among them
  trained: boolean;
};

type FieldUser = {
  id: string;
  roleId: string;
  subPosition: string | null;
  subPositions: string[];
  role: { type: string };
};

/**
 * Batched variant: per-field status for many users in two queries (all
 * matching courses once, all certificates once). Map key is the user id.
 */
export async function getFieldStatusForUsers(users: FieldUser[]): Promise<Map<string, FieldStatus[]>> {
  const result = new Map<string, FieldStatus[]>();
  const allFields = [...new Set(users.flatMap((u) => effectiveSubPositions(u)))];
  if (allFields.length === 0) {
    for (const u of users) result.set(u.id, []);
    return result;
  }

  const courses = await prisma.course.findMany({
    where: {
      published: true,
      roleAssignments: { some: { role: { type: "TRAINEE" }, subPosition: { in: allFields } } },
    },
    select: {
      id: true,
      roleAssignments: {
        where: { role: { type: "TRAINEE" }, subPosition: { in: allFields } },
        select: { roleId: true, subPosition: true },
      },
    },
  });

  const certs = await prisma.certificate.findMany({
    where: { userId: { in: users.map((u) => u.id) }, courseId: { in: courses.map((c) => c.id) } },
    select: { userId: true, courseId: true },
  });
  const certSet = new Set(certs.map((c) => `${c.userId}:${c.courseId}`));

  for (const user of users) {
    const fields = effectiveSubPositions(user);
    result.set(
      user.id,
      fields.map((name) => {
        // Matched by sub-position name (the query already limits to trainee-type roles).
        const required = courses.filter((c) => c.roleAssignments.some((ra) => ra.subPosition === name));
        const done = required.filter((c) => certSet.has(`${user.id}:${c.id}`)).length;
        return { name, total: required.length, done, trained: required.length > 0 && done === required.length };
      })
    );
  }
  return result;
}

export async function getFieldStatus(user: FieldUser): Promise<FieldStatus[]> {
  const fields = effectiveSubPositions(user);
  if (fields.length === 0) return [];

  // Matched by sub-position name across trainee-type roles, so the count
  // survives moving between rungs (Trainee → Tutor → Instructor).
  const assignmentFilter = { role: { type: "TRAINEE" as const }, subPosition: { in: fields } };

  const courses = await prisma.course.findMany({
    where: { published: true, roleAssignments: { some: assignmentFilter } },
    select: {
      id: true,
      roleAssignments: { where: assignmentFilter, select: { subPosition: true } },
    },
  });

  const certs = await prisma.certificate.findMany({
    where: { userId: user.id, courseId: { in: courses.map((c) => c.id) } },
    select: { courseId: true },
  });
  const certSet = new Set(certs.map((c) => c.courseId));

  return fields.map((name) => {
    const required = courses.filter((c) => c.roleAssignments.some((ra) => ra.subPosition === name));
    const done = required.filter((c) => certSet.has(c.id)).length;
    return { name, total: required.length, done, trained: required.length > 0 && done === required.length };
  });
}
