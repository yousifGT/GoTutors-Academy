import type { Role } from "@prisma/client";

/**
 * Rules about accounts that are worth stating once, away from the routes.
 */

export const ROLES: Role[] = [
  "SUPER_ADMIN",
  "HEAD_OFFICE",
  "REGIONAL_MANAGER",
  "FRANCHISEE",
  "CENTRE_HEAD",
  "INSPECTOR",
  "READ_ONLY",
];

/** Roles whose reach is defined by a list of centres. The rest see everything or only their own work. */
export const CENTRE_SCOPED_ROLES: Role[] = ["REGIONAL_MANAGER", "FRANCHISEE", "CENTRE_HEAD"];

/** Roles that can be given a list of centres they are expected to visit. */
export const ASSIGNABLE_ROLES: Role[] = ["INSPECTOR", "REGIONAL_MANAGER"];

export const MIN_PASSWORD = 12;

/**
 * Nobody may lock themselves out. Deactivating, deleting or demoting your own
 * account is refused — if the last super admin did any of those, there would be
 * no way back in without database access.
 */
export function isSelfLockout(actorId: string, targetId: string, change: { active?: boolean; role?: Role }): boolean {
  if (actorId !== targetId) return false;
  return change.active === false || (change.role !== undefined && change.role !== "SUPER_ADMIN");
}

/**
 * A password long enough to be worth having. Length carries far more weight
 * than character-class rules, so that is what is checked — plus a floor against
 * the handful of passwords everyone tries first.
 */
const OBVIOUS = ["password", "12345678", "qwerty", "letmein", "gotutors", "admin"];

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (OBVIOUS.some((o) => lower.includes(o))) return "That contains a word that is guessed first. Pick something else.";
  return null;
}
