import { prisma } from "@/lib/prisma";

/**
 * Recompute whether a trainee has completed every course assigned to their sub-position
 * and set User.isTrained accordingly. Idempotent.
 *
 * Trainees remain on the TRAINEE role after being trained; a Super Admin can manually
 * promote them to another role via the user edit page.
 */
export async function recomputeIsTrained(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || user.role.type !== "TRAINEE" || !user.subPosition) return user?.isTrained ?? false;

  // Every published course assigned to this trainee's role AND sub-position
  const required = await prisma.course.findMany({
    where: {
      published: true,
      roleAssignments: { some: { roleId: user.roleId, subPosition: user.subPosition } },
    },
    select: { id: true },
  });

  if (required.length === 0) {
    // No courses defined for this sub-position — leave as-is.
    return user.isTrained;
  }

  const heldCerts = await prisma.certificate.count({
    where: { userId, courseId: { in: required.map((c) => c.id) } },
  });

  const trained = heldCerts === required.length;
  if (trained !== user.isTrained) {
    await prisma.user.update({ where: { id: userId }, data: { isTrained: trained } });
  }
  return trained;
}
