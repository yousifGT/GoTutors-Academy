import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { CourseWizardDetails } from "@/components/course-wizard-details";

/** Step 1 revisited for an existing course — same form, edits in place. */
export default async function CourseDetailsPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: { roleAssignments: true, prerequisites: { select: { prerequisiteId: true } } },
  });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const [roles, subPositions, categoryRows] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: {
        category: { not: null },
        ...(session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id }),
      },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  const availableCourses = await prisma.course.findMany({
    where: {
      id: { not: course.id },
      ...(session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id }),
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/instructor/courses" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
      </div>
      <WizardSteps
        current={1}
        links={[null, `/instructor/courses/${course.id}/curriculum`, `/instructor/courses/${course.id}/review`]}
      />
      {course.published && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold">
          This course is live (v{course.version}) — trainees see changes immediately. Unpublish first for bigger reworks; each publish records a version snapshot.
        </div>
      )}
      <CourseWizardDetails
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        allSubPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        categories={categoryRows.map((c) => c.category as string)}
        availableCourses={availableCourses}
        initial={{
          id: course.id,
          title: course.title,
          description: course.description,
          category: course.category,
          passThreshold: course.passThreshold,
          roleIds: [...new Set(course.roleAssignments.map((r) => r.roleId))],
          subPositions: [...new Set(course.roleAssignments.map((r) => r.subPosition).filter(Boolean))] as string[],
          prerequisiteIds: course.prerequisites.map((p) => p.prerequisiteId),
        }}
      />
    </div>
  );
}
