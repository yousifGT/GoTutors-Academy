import { prisma } from "@/lib/prisma";
import { previouslyFlaggedSet, type PreviouslyFlagged } from "@/lib/repeat";

/**
 * What the last completed visit to this centre flagged.
 *
 * Matched on the stored question text rather than the question id: the checklist
 * is versioned, and an inspection run against v13 must still be comparable with
 * one run against v14. The text is snapshotted on every answer for exactly this
 * reason.
 */
export async function previouslyFlaggedAt(
  centreId: string,
  excludeInspectionId?: string
): Promise<PreviouslyFlagged> {
  const last = await prisma.inspection.findFirst({
    where: {
      centreId,
      status: "SUBMITTED",
      ...(excludeInspectionId ? { id: { not: excludeInspectionId } } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      answers: {
        where: { bucket: "IMPROVE" },
        select: { questionText: true },
      },
    },
  });
  return previouslyFlaggedSet((last?.answers ?? []).map((a) => a.questionText));
}
