import { prisma } from "@/lib/prisma";

export const PERMISSIONS = {
  // courses
  COURSE_CREATE: "course.create",
  COURSE_EDIT: "course.edit",
  COURSE_DELETE: "course.delete",
  COURSE_VIEW_ALL: "course.view_all",
  // users
  USER_CREATE: "user.create",
  USER_EDIT: "user.edit",
  USER_DELETE: "user.delete",
  USER_VIEW_ALL: "user.view_all",
  USER_VIEW_CENTRE: "user.view_centre",
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
  { key: PERMISSIONS.COURSE_VIEW_ALL, label: "View all courses", description: "View every course in the system" },
  { key: PERMISSIONS.USER_CREATE, label: "Create users", description: "Create new users" },
  { key: PERMISSIONS.USER_EDIT, label: "Edit users", description: "Edit user details" },
  { key: PERMISSIONS.USER_DELETE, label: "Delete users", description: "Delete users" },
  { key: PERMISSIONS.USER_VIEW_ALL, label: "View all users", description: "View users across all centres" },
  { key: PERMISSIONS.USER_VIEW_CENTRE, label: "View centre users", description: "View users in their centre" },
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
    PERMISSIONS.USER_VIEW_CENTRE,
    PERMISSIONS.QUIZ_UNLOCK_RETRY,
    PERMISSIONS.REPORTS_CENTRE,
    PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  INSTRUCTOR: [
    PERMISSIONS.COURSE_CREATE,
    PERMISSIONS.COURSE_EDIT,
    PERMISSIONS.COURSE_DELETE,
    PERMISSIONS.COURSE_VIEW_ALL,
    PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  TRAINEE: [],
};

export async function userHasPermission(userId: string, key: PermissionKey): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      permissionOverrides: { include: { permission: true } },
    },
  });
  if (!user) return false;
  const override = user.permissionOverrides.find((o) => o.permission.key === key);
  if (override) return override.allowed;
  const rolePerm = user.role.permissions.find((p) => p.permission.key === key);
  return rolePerm?.allowed ?? false;
}
