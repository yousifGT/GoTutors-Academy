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

export async function getFieldStatus(user: FieldUser): Promise<FieldStatus[]> {
  const fields = effectiveSubPositions(user);
  if (fields.length === 0) return [];

  // Trainees match courses through their own role; promoted teachers (now on
  // an instructor role) match their remaining fields through any trainee role.
  const assignmentFilter =
    user.role.type === "TRAINEE"
      ? { roleId: user.roleId, subPosition: { in: fields } }
      : { role: { type: "TRAINEE" as const }, subPosition: { in: fields } };

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
