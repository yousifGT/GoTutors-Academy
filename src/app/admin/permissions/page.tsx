import { prisma } from "@/lib/prisma";
import { requirePermission, requireRole } from "@/lib/session";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { PermissionsMatrix } from "@/components/permissions-matrix";
import { PageHeader } from "@/components/page-ui";

export default async function PermissionsPage() {
  await requireRole("SUPER_ADMIN");
  const { session } = await requirePermission(PERMISSIONS.PERMISSIONS_MANAGE); // same check as this page's API
  const [roles, perms, userOverrides, users] = await Promise.all([
    prisma.role.findMany({ include: { permissions: true }, orderBy: { name: "asc" } }),
    // Only the permissions the app knows. Retired ones (the three "view …"
    // toggles nothing ever checked) still have rows; they grant nothing, so
    // offering them would be offering switches wired to nothing.
    prisma.permission.findMany({ where: { key: { in: ALL_PERMISSIONS.map((p) => p.key) } }, orderBy: { label: "asc" } }),
    prisma.userPermissionOverride.findMany(),
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: { select: { name: true, type: true } } }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Permissions" subtitle="What each role can do, with per-user overrides." />
      <PermissionsMatrix
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        allowed: r.permissions.filter((p) => p.allowed).map((p) => p.permissionId),
      }))}
      permissions={perms.map((p) => ({ id: p.id, key: p.key, label: p.label, description: p.description ?? "" }))}
      users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role.name, roleType: u.role.type }))}
      overrides={userOverrides.map((o) => ({ userId: o.userId, permissionId: o.permissionId, allowed: o.allowed }))}
      viewerId={session.user.id}
      />
    </div>
  );
}
