import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserEditForm } from "@/components/user-edit-form";

export default async function CentreTraineeEditPage({ params }: { params: { id: string } }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) notFound();
  if (session.user.roleType === "CENTRE_ADMIN" && user.centreId !== session.user.centreId) notFound();

  const [roles, supervisors, subPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: {
        centreId: user.centreId ?? undefined,
        role: { type: { in: ["CENTRE_ADMIN", "INSTRUCTOR"] } },
      },
      include: { role: true },
      orderBy: { name: "asc" },
    }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-xl">
      <Link href={`/centre/trainees/${user.id}`} className="text-sm text-picton">← {user.name}</Link>
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
        centres={[]}
        supervisors={supervisors.map((s) => ({ id: s.id, name: s.name, role: s.role.name }))}
        subPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        scope="centre"
      />
    </div>
  );
}
