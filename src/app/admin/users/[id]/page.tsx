import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserEditForm } from "@/components/user-edit-form";

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
    <div className="max-w-xl">
      <Link href="/admin/users" className="text-sm text-picton">← All users</Link>
      <h2 className="text-2xl font-bold mt-1 mb-4">Edit {user.name}</h2>
      <UserEditForm
        userId={user.id}
        initial={{
          name: user.name, email: user.email,
          position: user.position, subPosition: user.subPosition, isTrained: user.isTrained,
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
