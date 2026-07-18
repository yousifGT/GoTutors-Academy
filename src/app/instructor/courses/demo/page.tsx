import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { DemoCourseList } from "@/components/demo-course-list";

/**
 * DEMO PREVIEW of the redesigned Courses section: searchable, filterable list
 * with quick actions, and a step-by-step "New course" wizard. Works against
 * real data — courses made here are real drafts. Once approved, this replaces
 * /instructor/courses and the demo route goes.
 */

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

export default async function DemoCoursesPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { modules: true, enrollments: true } }, roleAssignments: { include: { role: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold">
        Demo preview of the redesigned Courses section — everything works on real data. The current section is untouched at “Courses”.
      </div>
      <h2 className="text-lg font-bold">Courses</h2>
      <DemoCourseList
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          published: c.published,
          modules: c._count.modules,
          enrollments: c._count.enrollments,
          audience: compactAssignments(c.roleAssignments),
        }))}
      />
    </div>
  );
}
