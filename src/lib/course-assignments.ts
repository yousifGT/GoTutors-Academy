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

/** Role types whose people only a super admin may target with a course. */
export const ADMIN_ROLE_TYPES = ["SUPER_ADMIN", "CENTRE_ADMIN"] as const;

/**
 * Why a non-super-admin may not save this audience / prerequisite list, or
 * null if they may. Rows already on the course (put there by a super admin)
 * may be kept; only additions are checked.
 *
 * Assigning a course to an admin role enrols every admin on it, and an
 * instructor may open the profile of anyone enrolled in their course — so an
 * instructor who could assign the Super Admin role could read every super
 * admin's profile. A prerequisite opens with the course it unlocks
 * (learner-access.ts), so naming someone else's course as one would hand it to
 * this course's audience.
 */
export async function audienceEditRefusal(
  actor: { id: string; roleType: string },
  change: {
    roleIds?: readonly string[];
    prerequisiteIds?: readonly string[];
    existingRoleIds?: readonly string[];
    existingPrerequisiteIds?: readonly string[];
  }
): Promise<string | null> {
  if (actor.roleType === "SUPER_ADMIN") return null;
  const addedRoles = (change.roleIds ?? []).filter((id) => !(change.existingRoleIds ?? []).includes(id));
  if (addedRoles.length > 0) {
    const admin = await prisma.role.count({ where: { id: { in: addedRoles }, type: { in: [...ADMIN_ROLE_TYPES] } } });
    if (admin > 0) return "Only a super admin can assign a course to an admin role";
  }
  const addedPrereqs = (change.prerequisiteIds ?? []).filter(
    (id) => !(change.existingPrerequisiteIds ?? []).includes(id)
  );
  if (addedPrereqs.length > 0) {
    const foreign = await prisma.course.count({ where: { id: { in: addedPrereqs }, authorId: { not: actor.id } } });
    if (foreign > 0) return "You can only require your own courses as prerequisites";
  }
  return null;
}
