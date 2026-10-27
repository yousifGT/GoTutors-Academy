/**
 * When two names are the same name.
 *
 * Centres, roles and sub-positions were compared exactly, so "London Centre",
 * "london centre" and "London  Centre" could all exist side by side — two
 * centres nobody can tell apart in a dropdown, or one training field split in
 * two. Names are compared ignoring case and spacing; what is stored is still
 * what the person typed (trimmed by zName).
 */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/**
 * The existing record `name` would duplicate, if any. Pass the id of the record
 * being renamed as `selfId`: renaming something to a new spelling of its own
 * name ("london centre" → "London Centre") is a correction, not a duplicate.
 */
export function duplicateOf<T extends { id: string; name: string }>(
  name: string,
  existing: readonly T[],
  selfId?: string
): T | null {
  return existing.find((e) => e.id !== selfId && sameName(e.name, name)) ?? null;
}
