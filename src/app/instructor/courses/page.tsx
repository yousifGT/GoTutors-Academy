import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export default async function InstructorCoursesPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { modules: true, enrollments: true } }, roleAssignments: { include: { role: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Courses</h2>
        <Link href="/instructor/courses/new" className="gt-btn-primary">New course</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => (
          <Link key={c.id} href={`/instructor/courses/${c.id}`} className="gt-card p-5 hover:shadow-soft">
            <div className="text-lg font-bold">{c.title}</div>
            <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{c.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {c.roleAssignments.map((r) => (
                <span key={r.id} className="gt-badge bg-lavender text-magenta">
                  {r.role.name}{r.subPosition ? ` · ${r.subPosition}` : ""}
                </span>
              ))}
            </div>
            <div className="mt-3 text-xs text-[var(--muted)]">{c._count.modules} modules · {c._count.enrollments} enrolments</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
