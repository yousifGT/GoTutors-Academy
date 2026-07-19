import { prisma } from "@/lib/prisma";

/**
 * Would setting `prerequisiteIds` on `courseId` create a dependency cycle?
 * Walks the prerequisite graph upward from the proposed prerequisites; if the
 * course itself is reachable, the assignment would deadlock trainees
 * (A needs B, B needs A) and must be rejected. Also catches self-reference.
 */
export async function wouldCreateCycle(courseId: string, prerequisiteIds: string[]): Promise<boolean> {
  let frontier = [...new Set(prerequisiteIds)];
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    if (frontier.includes(courseId)) return true;
    const edges = await prisma.coursePrerequisite.findMany({
      where: { courseId: { in: frontier } },
      select: { prerequisiteId: true },
    });
    frontier = edges.map((e) => e.prerequisiteId).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  return false;
}

/**
 * The prerequisites of a course the user has NOT completed yet (no completed
 * enrollment). Empty array = course is unlocked.
 */
export async function getMissingPrerequisites(
  userId: string,
  courseId: string
): Promise<{ id: string; title: string }[]> {
  const prereqs = await prisma.coursePrerequisite.findMany({
    where: { courseId },
    include: { prerequisite: { select: { id: true, title: true } } },
  });
  if (prereqs.length === 0) return [];
  const completed = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: prereqs.map((p) => p.prerequisiteId) }, completed: true },
    select: { courseId: true },
  });
  const done = new Set(completed.map((e) => e.courseId));
  return prereqs.filter((p) => !done.has(p.prerequisiteId)).map((p) => p.prerequisite);
}
