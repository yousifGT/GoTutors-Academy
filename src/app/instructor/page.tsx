import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export default async function InstructorDashboard() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { enrollments: true, modules: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const totalEnrolments = courses.reduce((sum, c) => sum + c._count.enrollments, 0);
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Courses</div><div className="mt-2 text-3xl font-bold text-navy dark:text-ice">{courses.length}</div></div>
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Total enrolments</div><div className="mt-2 text-3xl font-bold text-picton">{totalEnrolments}</div></div>
        <div className="gt-card p-5 flex items-center justify-between"><div><div className="text-xs uppercase text-[var(--muted)]">Quick action</div><div className="mt-2 font-semibold">Create a course</div></div><Link href="/instructor/courses/new" className="gt-btn-primary">New</Link></div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">Your courses</h2>
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
                  <td className="text-right"><Link href={`/instructor/courses/${c.id}`} className="gt-btn-ghost text-sm">Manage</Link></td>
                </tr>
              ))}
              {courses.length === 0 && <tr><td colSpan={5} className="text-center text-[var(--muted)] py-8">No courses yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
