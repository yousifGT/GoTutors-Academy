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
