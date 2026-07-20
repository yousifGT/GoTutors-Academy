import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { PageHeader, EmptyState } from "@/components/page-ui";
import { UsersDirectory, DirectoryUser } from "@/components/users-directory";

export default async function AdminUsersPage() {
  await requireRole("SUPER_ADMIN");
  const users = await prisma.user.findMany({
    include: { role: true, centre: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const rows: DirectoryUser[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleName: u.role.name,
    roleType: u.role.type,
    position: u.position,
    subPositions: effectiveSubPositions(u),
    isTrained: u.isTrained,
    active: u.active,
    centreName: u.centre?.name ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Every account across all centres — click anyone for their full profile."
        actions={<Link href="/admin/users/new" className="gt-btn-primary">Add user</Link>}
      />
      {rows.length === 0 ? (
        <EmptyState icon="👥" title="No users yet" hint="Add your first user to get started." />
      ) : (
        <UsersDirectory users={rows} />
      )}
    </div>
  );
}
