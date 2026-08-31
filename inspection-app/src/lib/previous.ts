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
  excludeInspectionId?: string,
  /**
   * The date of the inspection being reported on. Without it, "the last visit"
   * means the most recent one that exists NOW — so opening a March report after
   * a June visit derives its repeat section from June, and the archived
   * document accuses the centre of not having fixed something before the visit
   * that first raised it. Everything else about a submitted inspection is
   * pinned to what was true at the time; this was the one panel that was not.
   */
  before?: Date
): Promise<PreviouslyFlagged> {
  const last = await prisma.inspection.findFirst({
    where: {
      centreId,
      status: "SUBMITTED",
      ...(excludeInspectionId ? { id: { not: excludeInspectionId } } : {}),
      ...(before ? { date: { lte: before } } : {}),
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
