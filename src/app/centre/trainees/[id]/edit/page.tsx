import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { canManageUser } from "@/lib/scope";
import { UserEditForm } from "@/components/user-edit-form";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { PageHeader } from "@/components/page-ui";

export default async function CentreTraineeEditPage({ params }: { params: { id: string } }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const user = await prisma.user.findUnique({ where: { id: params.id }, include: { role: true } });
  if (!user) notFound();
  // The admin view of a person is for the people you manage: a super admin
  // sees anyone, a centre admin only their own centre's trainees — the same
  // rule PATCH/DELETE /api/users/[id] enforce. It used to check the centre
  // alone, so a head of centre opening a notification about themselves landed
  // on their own admin profile, Edit button included (every save of which the
  // API then refused). Your own progress lives under My courses.
  if (session.user.roleType !== "SUPER_ADMIN") {
    if (user.id === session.user.id) redirect("/trainee/courses");
    if (!canManageUser(session.user, { roleType: user.role.type, centreId: user.centreId })) notFound();
  }

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
    <div className="max-w-3xl space-y-4">
      <PageHeader backHref={`/centre/trainees/${user.id}`} backLabel={user.name} title={`Edit ${user.name}`} subtitle="Update details, positions and status." />
      <UserEditForm
        userId={user.id}
        initial={{
          name: user.name, email: user.email, phone: user.phone,
          position: user.position, subPositions: effectiveSubPositions(user),
          teacherPositions: user.teacherPositions, isTrained: user.isTrained,
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
