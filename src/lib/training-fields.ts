import { prisma } from "@/lib/prisma";
import { RoleType } from "@prisma/client";

/**
 * Which of these names are not training fields.
 *
 * Fields are resolved by NAME across every trainee-typed role, never scoped to
 * one role. That is not a convenience — it is the only correct reading. A field
 * belongs to the Trainee role, but promotion moves the person onto the Tutor
 * role (itself trainee-typed, see promotion.ts) and leaves their unfinished
 * field names behind in subPositions. Scoping the lookup to the user's own role
 * therefore rejected every save for a promoted tutor: the Tutor role owns no
 * sub-positions, so the count was always zero and the API answered
 * "Sub-position does not exist for this role" for a name that plainly existed.
 *
 * auto-enrol.ts and field-training.ts already match this way and say so in
 * their own comments; the write paths were the last places that did not.
 *
 * `distinct` matters: the same field name can exist under more than one
 * trainee-typed role, so a plain count could exceed the number of names asked
 * about and fail a `count !== names.length` comparison on valid input.
 */
export async function unknownTrainingFields(names: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(names)];
  if (wanted.length === 0) return [];

  const rows = await prisma.subPosition.findMany({
    where: { name: { in: wanted }, role: { type: RoleType.TRAINEE } },
    select: { name: true },
    distinct: ["name"],
  });

  const known = new Set(rows.map((r) => r.name));
  return wanted.filter((name) => !known.has(name));
}

/** The message for a rejected set of field names, naming the ones at fault. */
export function unknownFieldsError(unknown: readonly string[]): string {
  return unknown.length === 1
    ? `Unknown training field: ${unknown[0]}`
    : `Unknown training fields: ${unknown.join(", ")}`;
}
