import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CourseList } from "@/components/course-list";
import { PageHeader } from "@/components/page-ui";

/** Same interactive course list as the instructor section, across ALL instructors. */

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

export default async function AdminCoursesPage() {
  await requireRole("SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    include: {
      author: { select: { name: true } },
      _count: { select: { modules: true, enrollments: true } },
      roleAssignments: { include: { role: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Courses" subtitle="Every course across all instructors — search, organise and publish." />
      <CourseList
        courses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          category: c.category,
          published: c.published,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          modules: c._count.modules,
          enrollments: c._count.enrollments,
          audience: compactAssignments(c.roleAssignments),
          author: c.author.name,
        }))}
      />
    </div>
  );
}
