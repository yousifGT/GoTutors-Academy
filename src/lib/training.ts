import { prisma } from "@/lib/prisma";
import { effectiveSubPositions } from "@/lib/sub-positions";

/**
 * Recompute whether a trainee has completed every course assigned to their sub-positions
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
  // Trainees train through their own role; promoted teachers (instructor role,
  // remaining trainee sub-positions) keep training through any trainee role.
  if (!user || (user.role.type !== "TRAINEE" && user.role.type !== "INSTRUCTOR")) {
    return user?.isTrained ?? false;
  }
  const subPositions = effectiveSubPositions(user);
  if (subPositions.length === 0) return user.isTrained;

  // Every published course assigned to this trainee's role AND any of their sub-positions
  const required = await prisma.course.findMany({
    where: {
      published: true,
      roleAssignments: {
        some:
          user.role.type === "TRAINEE"
            ? { roleId: user.roleId, subPosition: { in: subPositions } }
            : { role: { type: "TRAINEE" }, subPosition: { in: subPositions } },
      },
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
