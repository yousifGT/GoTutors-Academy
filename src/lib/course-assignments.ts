import { prisma } from "@/lib/prisma";

export type AssignmentRow = { roleId: string; subPosition: string | null };

/**
 * The CourseRoleAssignment rows for a "who is this course for?" selection.
 *
 * Sub-positions are training fields, which only trainee-type roles have, so they
 * narrow only those roles. Every other selected role is stored whole.
 *
 * This used to attach the selected fields to every role. Pick "Trainee" and
 * "Centre Admin", tick "Maths Trainee", and the admin role was saved as "centre
 * admins who are training in Maths" — a set nobody is in, so the course
 * reached no admin at all. auto-enrol.ts reads such legacy rows as whole-role.
 */
export function assignmentRows(
  roleIds: readonly string[],
  subPositions: readonly string[],
  traineeRoleIds: ReadonlySet<string>
): AssignmentRow[] {
  const rows: AssignmentRow[] = [];
  for (const roleId of roleIds) {
    if (subPositions.length === 0 || !traineeRoleIds.has(roleId)) {
      rows.push({ roleId, subPosition: null });
    } else {
      for (const sp of subPositions) rows.push({ roleId, subPosition: sp });
    }
  }
  return rows;
}

/** assignmentRows, with the trainee-type roles looked up. Shared by create and edit. */
export async function buildAssignmentRows(
  roleIds: readonly string[],
  subPositions: readonly string[]
): Promise<AssignmentRow[]> {
  const trainee = await prisma.role.findMany({
    where: { id: { in: [...roleIds] }, type: "TRAINEE" },
    select: { id: true },
  });
  return assignmentRows(roleIds, subPositions, new Set(trainee.map((r) => r.id)));
}
