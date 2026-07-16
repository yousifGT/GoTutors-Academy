import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { BulkEnrol } from "@/components/bulk-enrol";
import { effectiveSubPositions } from "@/lib/sub-positions";

export default async function BulkEnrolPage({ params }: { params: { id: string } }) {
  await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: { roleAssignments: true, enrollments: { select: { userId: true } } },
  });
  if (!course) notFound();

  const enrolledIds = new Set(course.enrollments.map((e) => e.userId));

  // Build candidate set: any user whose role matches the course role assignments
  const trainees = await prisma.user.findMany({
    where: {
      active: true,
      OR: course.roleAssignments.length === 0
        ? [{ role: { type: "TRAINEE" } }]
        : course.roleAssignments.map((ra) => ({
            roleId: ra.roleId,
            ...(ra.subPosition
              ? { OR: [{ subPosition: ra.subPosition }, { subPositions: { has: ra.subPosition } }] }
              : {}),
          })),
    },
    include: { centre: true, role: true },
    orderBy: { name: "asc" },
  });

  const candidates = trainees.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    centre: t.centre?.name ?? "—",
    position: effectiveSubPositions(t).join(", ") || t.position,
    alreadyEnrolled: enrolledIds.has(t.id),
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/instructor/courses/${course.id}`} className="text-sm text-picton">← {course.title}</Link>
        <h2 className="text-2xl font-bold mt-1">Bulk enrol</h2>
        <p className="text-sm text-[var(--muted)]">Candidates match the role and position assigned to this course.</p>
      </div>
      <BulkEnrol courseId={course.id} candidates={candidates} />
    </div>
  );
}
