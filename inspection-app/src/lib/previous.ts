import { prisma } from "@/lib/prisma";
import { previouslyFlaggedSet, type PreviouslyFlagged } from "@/lib/repeat";

/**
 * What the visit before this one flagged.
 *
 * Matched on the stored question text rather than the question id: the
 * checklist is versioned, and an inspection run against v13 must still be
 * comparable with one run against v14. The text is snapshotted on every answer
 * for exactly this reason.
 */
export async function previouslyFlaggedAt(
  centreId: string,
  opts: {
    /** The inspection being reported on, so it is not compared with itself. */
    exclude?: string;
    /**
     * Where the inspection being reported on sits in the centre's history.
     * Without it, "the last visit" means the most recent one that exists NOW —
     * so opening a March report after a June visit derives its repeat section
     * from June, and the archived document accuses the centre of not having
     * fixed something before the visit that first raised it.
     *
     * `createdAt` breaks the tie when two visits share a date. Ordering on the
     * date alone, two inspections of one centre on one day are indistinguishable,
     * and the earlier of the two would be compared against the later — reporting
     * a finding as unfixed before it had been raised. Rare, and wrong in the
     * direction that accuses a centre of something.
     *
     * Left out while an inspection is still being carried out: the inspector
     * wants the last completed visit, whenever it was.
     */
    before?: { date: Date; createdAt: Date };
  } = {}
): Promise<PreviouslyFlagged> {
  const last = await prisma.inspection.findFirst({
    where: {
      centreId,
      status: "SUBMITTED",
      ...(opts.exclude ? { id: { not: opts.exclude } } : {}),
      ...(opts.before
        ? {
            OR: [
              { date: { lt: opts.before.date } },
              { date: opts.before.date, createdAt: { lt: opts.before.createdAt } },
            ],
          }
        : {}),
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
