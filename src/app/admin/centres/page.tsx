import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERMISSIONS, getPermissions } from "@/lib/permissions";
import { CentresEditor } from "@/components/centres-editor";
import { PageHeader } from "@/components/page-ui";

export default async function CentresPage() {
  const session = await requireRole("SUPER_ADMIN");
  const perms = await getPermissions(session.user.id);
  const [centres, centreAdminRole] = await Promise.all([
    prisma.centre.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.role.findFirst({ where: { type: "CENTRE_ADMIN" }, orderBy: { name: "asc" }, select: { id: true } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Centres" subtitle="The physical locations trainees belong to — open one for its people and performance." />
      <CentresEditor
      centres={centres.map((c) => ({ id: c.id, name: c.name, location: c.location ?? "", users: c._count.users }))}
      centreAdminRoleId={centreAdminRole?.id ?? null}
      can={{ manage: perms.has(PERMISSIONS.CENTRE_MANAGE), createUsers: perms.has(PERMISSIONS.USER_CREATE) }}
      />
    </div>
  );
}
