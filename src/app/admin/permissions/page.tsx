import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PermissionsMatrix } from "@/components/permissions-matrix";
import { PageHeader } from "@/components/page-ui";

export default async function PermissionsPage() {
  await requireRole("SUPER_ADMIN");
  const [roles, perms, userOverrides, users] = await Promise.all([
    prisma.role.findMany({ include: { permissions: true }, orderBy: { name: "asc" } }),
    prisma.permission.findMany({ orderBy: { label: "asc" } }),
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
      />
    </div>
  );
}
