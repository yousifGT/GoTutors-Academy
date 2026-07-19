import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserEditForm } from "@/components/user-edit-form";
import { PageHeader } from "@/components/page-ui";
import { effectiveSubPositions } from "@/lib/sub-positions";

export default async function AdminUserEditPage({ params }: { params: { id: string } }) {
  await requireRole("SUPER_ADMIN");
  const [user, roles, centres, supervisors, subPositions] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.id } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.centre.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: { type: { in: ["CENTRE_ADMIN", "INSTRUCTOR", "SUPER_ADMIN"] } } },
      include: { role: true },
      orderBy: { name: "asc" },
    }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader backHref="/admin/users" backLabel="All users" title={`Edit ${user.name}`} subtitle="Update details, role, positions and status." />
      <UserEditForm
        userId={user.id}
        initial={{
          name: user.name, email: user.email, phone: user.phone,
          position: user.position, subPositions: effectiveSubPositions(user), isTrained: user.isTrained,
          active: user.active,
          roleId: user.roleId, centreId: user.centreId, supervisorId: user.supervisorId,
        }}
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        centres={centres.map((c) => ({ id: c.id, name: c.name }))}
        supervisors={supervisors.map((s) => ({ id: s.id, name: s.name, role: s.role.name }))}
        subPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        scope="admin"
      />
    </div>
  );
}
