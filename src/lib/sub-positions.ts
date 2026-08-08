export const SUB_POSITIONS = [
  "Maths Tutor",
  "Science Tutor",
  "English Tutor",
  "11+ Tutor",
  "Supervisor",
  "Admin & Accounts",
  "Calling & Customer Service",
  "Head of Centre",
  "Support Staff",
] as const;

export type SubPosition = (typeof SUB_POSITIONS)[number];

export function isValidSubPosition(value: unknown): value is SubPosition {
  return typeof value === "string" && (SUB_POSITIONS as readonly string[]).includes(value);
}

/**
 * The tutor title a training field promotes into: "Maths Trainee" → "Maths
 * Tutor", "Maths" → "Maths Tutor", and "Maths Tutor" stays as-is (no
 * "Tutor Tutor"). Used by the promote flow and its labels.
 */
export function tutorTitleFor(field: string): string {
  const base = field.replace(/\s+(trainee|tutor)\s*$/i, "").trim();
  return `${base || field} Tutor`;
}

/**
 * The field a stored tutor title came from, resolved against the sub-positions
 * that actually exist.
 *
 * teacherPositions stores the TITLE, not the field name, and the transform isn't
 * reversible on its own: "Head of Centre Tutor" could have come from the field
 * "Head of Centre" or from a field literally called "Head of Centre Tutor". So
 * match forwards against the known field names instead of trying to strip the
 * suffix. Returns null for a title whose field no longer exists (renamed or
 * deleted), which callers should treat as "nothing to require".
 */
export function fieldNameForTutorTitle(title: string, knownFields: readonly string[]): string | null {
  return knownFields.find((field) => tutorTitleFor(field) === title) ?? null;
}

/** The field names a user is qualified to tutor, from their stored titles. */
export function tutoredFieldNames(teacherPositions: readonly string[], knownFields: readonly string[]): string[] {
  const names = teacherPositions
    .map((title) => fieldNameForTutorTitle(title, knownFields))
    .filter((name): name is string => name !== null);
  return [...new Set(names)];
}

/**
 * A trainee's sub-positions live in User.subPositions (multi). The legacy
 * single-value User.subPosition column stays readable so accounts created
 * before the multi-position change keep matching until they are next edited.
 */
export function effectiveSubPositions(user: {
  subPosition?: string | null;
  subPositions?: string[];
}): string[] {
  const names = new Set<string>(user.subPositions ?? []);
  if (user.subPosition) names.add(user.subPosition);
  return [...names];
}
