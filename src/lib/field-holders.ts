import { prisma } from "@/lib/prisma";
import { tutorTitleFor } from "@/lib/sub-positions";

/**
 * Who currently holds a training field, counted the way the rest of the app
 * resolves fields: by NAME, across every role.
 *
 * The delete guard used to count `roleId: <the field's own role>` and read only
 * subPosition/subPositions. That misses exactly the population promotion
 * creates — a promoted tutor sits on the Tutor role with the field stored in
 * teacherPositions as a title — so the guard returned zero for well-staffed
 * fields and let them be deleted. The admin UI meanwhile counted correctly and
 * told the operator "the server will reject this deletion", which it did not.
 */
export type FieldHolders = {
  /** Still working through the field's courses. */
  training: number;
  /** Qualified in it, so the field's title is in teacherPositions. */
  tutoring: number;
  total: number;
};

export async function countFieldHolders(name: string): Promise<FieldHolders> {
  const [training, tutoring] = await Promise.all([
    prisma.user.count({
      where: { OR: [{ subPosition: name }, { subPositions: { has: name } }] },
    }),
    prisma.user.count({
      where: { teacherPositions: { has: tutorTitleFor(name) } },
    }),
  ]);
  return { training, tutoring, total: training + tutoring };
}

/** "3 in training and 1 tutoring it" — for an error a person has to act on. */
export function describeFieldHolders(holders: FieldHolders): string {
  const parts: string[] = [];
  if (holders.training > 0) parts.push(`${holders.training} in training`);
  if (holders.tutoring > 0) parts.push(`${holders.tutoring} qualified to tutor it`);
  return parts.join(" and ");
}
