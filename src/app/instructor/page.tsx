import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CoursePublishToggle } from "@/components/course-publish-toggle";
import { PageHeader, StatCard, EmptyState } from "@/components/page-ui";

export default async function InstructorDashboard() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { enrollments: true, modules: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const totalEnrolments = courses.reduce((sum, c) => sum + c._count.enrollments, 0);
  const drafts = courses.filter((c) => !c.published).length;
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's how your courses are doing."
        actions={<Link href="/instructor/courses/new" className="gt-btn-primary">+ New course</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Courses" value={courses.length} icon="📚" tone="navy" hint={drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"}` : undefined} />
        <StatCard label="Total enrolments" value={totalEnrolments} icon="🧑‍🎓" tone="picton" />
        <StatCard label="Published" value={courses.length - drafts} icon="✅" tone="mint" />
      </section>

      <section>
        <h3 className="mb-3 text-lg font-bold">Your courses</h3>
        {courses.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No courses yet"
            hint="Create your first course — the wizard walks you through details, curriculum and publishing."
            action={<Link href="/instructor/courses/new" className="gt-btn-primary">Create a course</Link>}
          />
        ) : (
          <div className="gt-card overflow-hidden">
            <table className="gt-table">
              <thead><tr><th>Title</th><th>Modules</th><th>Enrolments</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.title}</td>
                    <td>{c._count.modules}</td>
                    <td>{c._count.enrollments}</td>
                    <td>{c.published ? <span className="gt-badge bg-mint/20 text-mint">Published</span> : <span className="gt-badge bg-gold/20 text-gold">Draft</span>}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <CoursePublishToggle courseId={c.id} published={c.published} />
                        <Link href={`/instructor/courses/${c.id}`} className="gt-btn-ghost text-sm">Manage</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
