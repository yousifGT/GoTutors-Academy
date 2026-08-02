import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RolesManager } from "@/components/roles-manager";
import { PageHeader } from "@/components/page-ui";
import { effectiveSubPositions, tutorTitleFor } from "@/lib/sub-positions";

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
  // Each field has two populations, and counting only the first made the page
  // lie: promotion moves a completed field out of subPositions into
  // teacherPositions, so every promoted tutor vanished and well-staffed fields
  // read "0 users".
  //
  // Counted by field NAME rather than roleId:name, because a promoted tutor sits
  // on a different role (Tutor) to the sub-position's own (Trainee) — and because
  // that is already how auto-enrol and field-training match fields.
  const usersWithFields = await prisma.user.findMany({
    where: {
      OR: [
        { subPosition: { not: null } },
        { subPositions: { isEmpty: false } },
        { teacherPositions: { isEmpty: false } },
      ],
    },
    select: { subPosition: true, subPositions: true, teacherPositions: true },
  });
  const trainingByField = new Map<string, number>();
  const tutoringByTitle = new Map<string, number>();
  for (const u of usersWithFields) {
    for (const name of effectiveSubPositions(u)) trainingByField.set(name, (trainingByField.get(name) ?? 0) + 1);
    // teacherPositions holds the tutor TITLE, which only equals the field name
    // when the field already ends in "Tutor" ("Head of Centre" becomes
    // "Head of Centre Tutor"), so match through the same transform.
    for (const title of u.teacherPositions) tutoringByTitle.set(title, (tutoringByTitle.get(title) ?? 0) + 1);
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
        trainingCount: trainingByField.get(s.name) ?? 0,
        tutoringCount: tutoringByTitle.get(tutorTitleFor(s.name)) ?? 0,
        courseCount: courseCountBySub.get(`${s.roleId}:${s.name}`) ?? 0,
      }))}
      />
    </div>
  );
}
