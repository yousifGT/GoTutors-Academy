import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserForm } from "@/components/user-form";

export default async function NewTraineePage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const [roles, subPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  const centres = session.user.roleType === "SUPER_ADMIN"
    ? await prisma.centre.findMany({ orderBy: { name: "asc" } })
    : (session.user.centreId
        ? [await prisma.centre.findUniqueOrThrow({ where: { id: session.user.centreId } })]
        : []);
  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-bold mb-4">Add trainee</h2>
      <UserForm
        roles={roles
          .filter((r) => session.user.roleType === "SUPER_ADMIN" || r.type === "TRAINEE")
          .map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        centres={centres.map((c) => ({ id: c.id, name: c.name }))}
        subPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        defaultRoleType="TRAINEE"
        fixedCentreId={session.user.roleType === "SUPER_ADMIN" ? null : session.user.centreId}
        afterCreate="/centre/trainees"
      />
    </div>
  );
}
