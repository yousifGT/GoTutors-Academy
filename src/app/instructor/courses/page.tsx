import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CourseList } from "@/components/course-list";

/** "Trainee — Maths Tutor, English Tutor +2 more" instead of one badge per assignment. */
function compactAssignments(assignments: { role: { name: string }; subPosition: string | null }[]): string[] {
  const byRole = new Map<string, string[] | null>(); // null = the whole role
  for (const a of assignments) {
    const current = byRole.get(a.role.name);
    if (a.subPosition === null || current === null) {
      byRole.set(a.role.name, null);
      continue;
    }
    byRole.set(a.role.name, [...(current ?? []), a.subPosition]);
  }
  return [...byRole.entries()].map(([role, subs]) => {
    if (subs === null) return `${role} — everyone`;
    const shown = subs.slice(0, 3).join(", ");
    return subs.length > 3 ? `${role} — ${shown} +${subs.length - 3} more` : `${role} — ${shown}`;
  });
}

export default async function InstructorCoursesPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { modules: true, enrollments: true } }, roleAssignments: { include: { role: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Courses</h2>
      <CourseList
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          category: c.category,
          published: c.published,
          modules: c._count.modules,
          enrollments: c._count.enrollments,
          audience: compactAssignments(c.roleAssignments),
        }))}
      />
    </div>
  );
}
