import type { Prisma } from "@prisma/client";

/**
 * Finding a child.
 *
 * Staff look people up by admission number far more often than by name — it is
 * on the paper, it is unambiguous, and two children called Mohammed Ali are
 * routine. So an exact admission-number match is treated as a different kind of
 * result from a name match, and the caller puts it first.
 */

/** Normalised for comparison: case and separators are not part of the number. */
export function normaliseAdmissionNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s/\\_-]+/g, "");
}

/**
 * A Prisma filter for a search box that takes either a name or a number.
 *
 * An empty query matches everything, because an empty search box means "show me
 * the list", not "show me nothing".
 */
export function studentSearchFilter(query: string): Prisma.StudentWhereInput {
  const q = query.trim();
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { admissionNumber: { contains: q, mode: "insensitive" } },
    ],
  };
}

/**
 * Put an exact admission-number match at the top.
 *
 * Postgres can sort the rest; this only has to answer "did they type the number
 * of the child they want?", which `contains` alone gets wrong — searching
 * "A-1" surfaces "A-10" and "A-100" above the child actually called "A-1".
 */
export function rankStudents<T extends { name: string; admissionNumber: string }>(
  students: T[],
  query: string
): T[] {
  const target = normaliseAdmissionNumber(query);
  if (!target) return students;
  return [...students].sort((a, b) => {
    const rank = (s: T) => (normaliseAdmissionNumber(s.admissionNumber) === target ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.name.localeCompare(b.name);
  });
}
