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
  const matches = knownFields.filter((field) => tutorTitleFor(field) === title);
  if (matches.length <= 1) return matches[0] ?? null;
  // Two fields can map to the same title ("Maths", "Maths Trainee" and "Maths
  // Tutor" all yield "Maths Tutor"). Creating that pair is now refused, but
  // older data may already contain one — and `find` over an unordered query
  // meant the answer could differ between two call sites, or between two
  // requests, silently evaluating a tutor against the wrong course set. Prefer
  // the field whose name IS the title, else the first alphabetically: wrong is
  // possible, arbitrary is not.
  return matches.find((field) => field === title) ?? [...matches].sort()[0];
}

/**
 * The existing field, if any, that already promotes to the same tutor title.
 *
 * tutorTitleFor is lossy, so two differently-named fields can produce one title
 * and then compete to be resolved back from it. Rejecting the second one at
 * creation is the only place this can be prevented cheaply.
 */
export function collidingFieldName(
  name: string,
  existingFields: readonly string[]
): string | null {
  const title = tutorTitleFor(name);
  return existingFields.find((field) => field !== name && tutorTitleFor(field) === title) ?? null;
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
