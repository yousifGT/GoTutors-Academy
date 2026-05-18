import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RolesManager } from "@/components/roles-manager";

export default async function RolesPage() {
  await requireRole("SUPER_ADMIN");

  const [roles, subPositions, userCountsRaw] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({
      include: { role: { select: { id: true, name: true } } },
      orderBy: [{ role: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.user.groupBy({ by: ["roleId"], _count: { _all: true } }),
  ]);

  const userCountByRole = new Map(userCountsRaw.map((g) => [g.roleId, g._count._all]));
  const userCountsBySubPosition = await prisma.user.groupBy({
    by: ["roleId", "subPosition"],
    where: { subPosition: { not: null } },
    _count: { _all: true },
  });
  const usageBySub = new Map(
    userCountsBySubPosition.map((g) => [`${g.roleId}:${g.subPosition}`, g._count._all])
  );

  return (
    <RolesManager
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        description: r.description,
        userCount: userCountByRole.get(r.id) ?? 0,
      }))}
      subPositions={subPositions.map((s) => ({
        id: s.id,
        name: s.name,
        roleId: s.roleId,
        roleName: s.role.name,
        userCount: usageBySub.get(`${s.roleId}:${s.name}`) ?? 0,
      }))}
    />
  );
}
