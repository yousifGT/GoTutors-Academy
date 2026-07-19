import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RolesManager } from "@/components/roles-manager";
import { PageHeader } from "@/components/page-ui";
import { effectiveSubPositions } from "@/lib/sub-positions";

export default async function RolesPage() {
  await requireRole("SUPER_ADMIN");

  const [roles, subPositions, userCountsRaw, courseCountsRaw] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({
      include: { role: { select: { id: true, name: true } } },
      orderBy: [{ role: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.user.groupBy({ by: ["roleId"], _count: { _all: true } }),
    prisma.courseRoleAssignment.groupBy({
      by: ["roleId", "subPosition"],
      where: { subPosition: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const userCountByRole = new Map(userCountsRaw.map((g) => [g.roleId, g._count._all]));
  const courseCountBySub = new Map(courseCountsRaw.map((g) => [`${g.roleId}:${g.subPosition}`, g._count._all]));
  // Sub-positions are multi-valued (plus the legacy single column), so count
  // holders in app code rather than with a column groupBy.
  const usersWithSubs = await prisma.user.findMany({
    where: { OR: [{ subPosition: { not: null } }, { subPositions: { isEmpty: false } }] },
    select: { roleId: true, subPosition: true, subPositions: true },
  });
  const usageBySub = new Map<string, number>();
  for (const u of usersWithSubs) {
    for (const name of effectiveSubPositions(u)) {
      const key = `${u.roleId}:${name}`;
      usageBySub.set(key, (usageBySub.get(key) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Roles & sub-positions" subtitle="Role types drive access; sub-positions drive automatic course enrolment." />
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
        courseCount: courseCountBySub.get(`${s.roleId}:${s.name}`) ?? 0,
      }))}
      />
    </div>
  );
}
