import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Link from "next/link";
import { UserForm } from "@/components/user-form";
import { PageHeader } from "@/components/page-ui";

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
    <div className="max-w-xl space-y-4">
      <PageHeader backHref="/centre/trainees" backLabel="Trainees" title="Add trainee" subtitle="They're auto-enrolled in every published course matching their sub-positions." />
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
