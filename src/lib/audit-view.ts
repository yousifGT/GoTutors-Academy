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

/**
 * What the entry says it did, in words.
 *
 * The log stored machine slugs and the page printed them raw, so the busiest
 * column read `user.auto_promoted_tutor` and `sub-position.delete`. Slugs are
 * right for the database — they're stable and greppable — and wrong for a page
 * a centre manager reads. Unknown slugs fall through to a generic tidy-up
 * rather than a placeholder, so a new action added later is still legible
 * before anyone remembers to name it here.
 */
const ACTION_LABELS: Record<string, string> = {
  "role.create": "Created role",
  "role.update": "Updated role",
  "role.delete": "Deleted role",
  "role.permission.allow": "Granted permission",
  "role.permission.deny": "Revoked permission",
  "sub-position.create": "Added sub-position",
  "sub-position.rename": "Renamed sub-position",
  "sub-position.delete": "Removed sub-position",
  "user.permission.allow": "Granted permission",
  "user.permission.deny": "Revoked permission",
  "user.permission.inherit": "Reset permission",
  "user.password_changed_self": "Changed own password",
  "user.promoted_teacher": "Promoted to tutor",
  "user.auto_promoted_tutor": "Promoted to tutor (automatic)",
  "course.require_retraining": "Required retraining",
};

export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

/**
 * The target, split into the thing and the thing it belongs to.
 *
 * Targets are written as `kind:value`, and the sub-position routes wrote
 * `Role:Name` — so a sub-position called "," under Trainee rendered as the
 * uninformative `Trainee:,`. The action tells us which shape to expect, which is
 * more reliable than guessing from the string: only `sub-position.*` puts a role
 * name before the colon, and every other prefix is a literal kind to strip.
 */
export type AuditTarget = { label: string; qualifier: string | null };

export function describeTarget(action: string, target: string | null | undefined): AuditTarget | null {
  if (!target) return null;
  const colon = target.indexOf(":");

  // `role:Tutor`, `user:someone@example.com`, `sub-position:Maths Trainee` — the
  // prefix repeats what the action already said, so drop it.
  if (colon > 0 && action.startsWith(`${target.slice(0, colon)}.`)) {
    const rest = target.slice(colon + 1).trim();
    return { label: rest || "(unnamed)", qualifier: null };
  }

  // Entries written before the format was unified put the role name first, so
  // `Trainee:Maths Tutor` still has to render sensibly.
  if (action.startsWith("sub-position.") && colon > 0) {
    return {
      label: target.slice(colon + 1).trim() || "(unnamed)",
      qualifier: target.slice(0, colon).trim() || null,
    };
  }

  return { label: target, qualifier: null };
}

/**
 * Readable facts from the metadata blob.
 *
 * The Details column printed `JSON.stringify(metadata)`, which is the right
 * thing to keep (it's the forensic record) and the wrong thing to lead with. The
 * full JSON stays in the cell's tooltip; these are the parts worth reading at a
 * glance. Keys already shown elsewhere in the row — the field badge, the action
 * label — are deliberately absent so the row doesn't say the same thing twice.
 */
export function auditFacts(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const m = metadata as Record<string, unknown>;
  const facts: string[] = [];

  if (typeof m.permission === "string" && m.permission.trim()) facts.push(`Permission: ${m.permission}`);
  if (typeof m.role === "string" && m.role.trim()) facts.push(`Role: ${m.role}`);
  if (typeof m.type === "string" && m.type.trim()) facts.push(`Type: ${m.type}`);
  if (m.roleUpgraded === true) facts.push("Role upgraded to Tutor");
  if (typeof m.fromVersion === "number") facts.push(`Certificates below v${m.fromVersion} superseded`);
  if (Array.isArray(m.remainingFields)) {
    const left = m.remainingFields.filter((f): f is string => typeof f === "string" && !!f.trim());
    if (left.length) facts.push(`Still training: ${left.join(", ")}`);
  }
  if (typeof m.reason === "string" && m.reason.trim()) facts.push(m.reason);

  return facts;
}
