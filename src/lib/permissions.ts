import { prisma } from "@/lib/prisma";

export const PERMISSIONS = {
  // courses
  COURSE_CREATE: "course.create",
  COURSE_EDIT: "course.edit",
  COURSE_DELETE: "course.delete",
  // users
  USER_CREATE: "user.create",
  USER_EDIT: "user.edit",
  USER_DELETE: "user.delete",
  // centres
  CENTRE_MANAGE: "centre.manage",
  // quiz
  QUIZ_UNLOCK_RETRY: "quiz.unlock_retry",
  // permissions
  PERMISSIONS_MANAGE: "permissions.manage",
  // reports
  REPORTS_GLOBAL: "reports.global",
  REPORTS_CENTRE: "reports.centre",
  // notifications
  NOTIFICATIONS_VIEW: "notifications.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: { key: PermissionKey; label: string; description: string }[] = [
  { key: PERMISSIONS.COURSE_CREATE, label: "Create courses", description: "Create new courses" },
  { key: PERMISSIONS.COURSE_EDIT, label: "Edit courses", description: "Edit courses, modules, lessons, quizzes" },
  { key: PERMISSIONS.COURSE_DELETE, label: "Delete courses", description: "Delete courses" },
  { key: PERMISSIONS.USER_CREATE, label: "Create users", description: "Create new users" },
  { key: PERMISSIONS.USER_EDIT, label: "Edit users", description: "Edit user details" },
  { key: PERMISSIONS.USER_DELETE, label: "Delete users", description: "Delete users" },
  { key: PERMISSIONS.CENTRE_MANAGE, label: "Manage centres", description: "Add, edit and remove centres" },
  { key: PERMISSIONS.QUIZ_UNLOCK_RETRY, label: "Unlock quiz retries", description: "Unlock quizzes for trainees who hit the retry limit" },
  { key: PERMISSIONS.PERMISSIONS_MANAGE, label: "Manage permissions", description: "Edit role and user permissions" },
  { key: PERMISSIONS.REPORTS_GLOBAL, label: "Global reports", description: "Run reports across all centres" },
  { key: PERMISSIONS.REPORTS_CENTRE, label: "Centre reports", description: "Run reports for a single centre" },
  { key: PERMISSIONS.NOTIFICATIONS_VIEW, label: "View notifications", description: "View notification feed" },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS.map((p) => p.key),
  CENTRE_ADMIN: [
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_EDIT,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.QUIZ_UNLOCK_RETRY,
    PERMISSIONS.REPORTS_CENTRE,
    PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  INSTRUCTOR: [
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_EDIT,
    PERMISSIONS.COURSE_DELETE,
    PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  TRAINEE: [],
};

const KNOWN_KEYS: ReadonlySet<string> = new Set(ALL_PERMISSIONS.map((p) => p.key));

/**
 * What a person may do: their own override where they have one, otherwise
 * their role's grant. Unknown keys are dropped, so permissions retired from
 * ALL_PERMISSIONS but still in the database grant nothing.
 *
 * The single definition both sides use. The API routes enforced permissions
 * and the pages never looked at them, so switching one off hid nothing — the
 * person found out only when an action failed. Pages, sidebar links and
 * buttons now ask the same question the routes ask, through this function.
 */
export function resolvePermissions(
  roleGrants: readonly { key: string; allowed: boolean }[],
  overrides: readonly { key: string; allowed: boolean }[]
): Set<PermissionKey> {
  const effective = new Map<string, boolean>();
  for (const g of roleGrants) effective.set(g.key, g.allowed);
  for (const o of overrides) effective.set(o.key, o.allowed);
  const out = new Set<PermissionKey>();
  for (const [key, allowed] of effective) if (allowed && KNOWN_KEYS.has(key)) out.add(key as PermissionKey);
  return out;
}

/** Everything a user may do, in one query. Empty for an unknown user. */
export async function getPermissions(userId: string): Promise<Set<PermissionKey>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { permissions: { select: { allowed: true, permission: { select: { key: true } } } } } },
      permissionOverrides: { select: { allowed: true, permission: { select: { key: true } } } },
    },
  });
  if (!user) return new Set();
  return resolvePermissions(
    user.role.permissions.map((p) => ({ key: p.permission.key, allowed: p.allowed })),
    user.permissionOverrides.map((o) => ({ key: o.permission.key, allowed: o.allowed }))
  );
}

export async function userHasPermission(userId: string, key: PermissionKey): Promise<boolean> {
  return (await getPermissions(userId)).has(key);
}

/**
 * The course actions a set of permissions allows. Shared by both Courses pages
 * (admin and instructor) so the same course list can't offer different
 * buttons depending on which URL it was reached from.
 */
export function courseActionsFor(perms: ReadonlySet<PermissionKey>) {
  return {
    create: perms.has(PERMISSIONS.COURSE_CREATE),
    edit: perms.has(PERMISSIONS.COURSE_EDIT),
    delete: perms.has(PERMISSIONS.COURSE_DELETE),
  };
}

/**
 * The person-management actions a set of permissions allows, matching the
 * routes: POST /api/users (create), PATCH /api/users/[id] (edit — including
 * deactivate and password reset), DELETE /api/users/[id] (delete), and
 * /api/quiz/unlock (unlock). Who they may be used ON is still canManageUser.
 */
export function userActionsFor(perms: ReadonlySet<PermissionKey>) {
  return {
    create: perms.has(PERMISSIONS.USER_CREATE),
    edit: perms.has(PERMISSIONS.USER_EDIT),
    delete: perms.has(PERMISSIONS.USER_DELETE),
    unlock: perms.has(PERMISSIONS.QUIZ_UNLOCK_RETRY),
  };
}

/**
 * How many ACTIVE super admins other than `exceptUserId` can manage
 * permissions. Pass a transaction client to count inside a transaction.
 *
 * The last-super-admin guards counted super admins, not this. A super admin
 * whose "Manage permissions" had been switched off could still deactivate,
 * demote or delete the only one who had it — leaving nobody able to open the
 * Permissions page, with no repair path short of a shell. The matrix itself
 * cannot do this: whoever switches the permission off must hold it, and cannot
 * change their own.
 */
export async function otherPermissionManagers(
  exceptUserId: string,
  db: { user: Pick<typeof prisma.user, "findMany"> } = prisma
): Promise<number> {
  const supers = await db.user.findMany({
    where: { role: { type: "SUPER_ADMIN" }, active: true, id: { not: exceptUserId } },
    select: {
      role: { select: { permissions: { select: { allowed: true, permission: { select: { key: true } } } } } },
      permissionOverrides: { select: { allowed: true, permission: { select: { key: true } } } },
    },
  });
  return supers.filter((u) =>
    resolvePermissions(
      u.role.permissions.map((p) => ({ key: p.permission.key, allowed: p.allowed })),
      u.permissionOverrides.map((o) => ({ key: o.permission.key, allowed: o.allowed }))
    ).has(PERMISSIONS.PERMISSIONS_MANAGE)
  ).length;
}
