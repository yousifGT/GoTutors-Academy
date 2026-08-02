/**
 * Presentation helpers for audit entries.
 *
 * `AuditLog.target` is not one thing. Most call sites write a readable label
 * (`role:Tutor`, `Trainee:Maths Tutor`, `user:someone@example.com`), but a few —
 * promotion in particular — write a bare user id. Those rendered as raw cuids on
 * the dashboard and audit page: unreadable, and three promotions of the same
 * person looked like the same entry written three times, when they were actually
 * three different fields.
 *
 * So: resolve the ones that are ids, leave the ones that are already labels, and
 * surface the piece of metadata that tells entries apart.
 */

/** cuid()s are what Prisma generates for ids here: `c` then 20+ base36 chars. */
const CUID = /^c[a-z0-9]{20,}$/;

export function looksLikeUserId(target: string | null | undefined): boolean {
  return !!target && CUID.test(target);
}

/** The ids among these targets that are worth looking up. */
export function userIdTargets(targets: (string | null)[]): string[] {
  return [...new Set(targets.filter(looksLikeUserId) as string[])];
}

/**
 * The distinguishing detail for an entry, when there is one. Promotions carry
 * the field they were for, which is the difference between three identical-looking
 * rows and three intelligible ones.
 */
export function auditDetail(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["field", "tutorTitle", "subPosition", "name"] as const) {
    const value = m[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
