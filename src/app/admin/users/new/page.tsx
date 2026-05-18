import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserForm } from "@/components/user-form";

export default async function AdminNewUserPage() {
  await requireRole("SUPER_ADMIN");
  const [roles, centres, subPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.centre.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold mb-4">Add user</h2>
      <UserForm
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        centres={centres.map((c) => ({ id: c.id, name: c.name }))}
        subPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        afterCreate="/admin/users"
      />
    </div>
  );
}
