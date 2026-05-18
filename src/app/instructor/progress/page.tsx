import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";

export default async function InstructorProgressPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const where = session.user.roleType === "SUPER_ADMIN" ? {} : { course: { authorId: session.user.id } };
  const enrollments = await prisma.enrollment.findMany({
    where,
    include: { user: true, course: true },
    orderBy: { enrolledAt: "desc" },
    take: 200,
  });
  const rows = await Promise.all(enrollments.map(async (e) => ({
    e,
    progress: await getCourseProgressForUser(e.userId, e.courseId),
  })));

  return (
    <div className="gt-card overflow-hidden">
      <table className="gt-table">
        <thead><tr><th>Trainee</th><th>Course</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(({ e, progress }) => (
            <tr key={e.id}>
              <td>{e.user.name}<div className="text-xs text-[var(--muted)]">{e.user.email}</div></td>
              <td>{e.course.title}</td>
              <td className="w-64">
                <div className="flex items-center gap-3">
                  <ProgressBar percent={progress?.percent ?? 0} />
                  <span className="text-xs w-10 text-right">{progress?.percent ?? 0}%</span>
                </div>
              </td>
              <td>{e.completed ? <span className="gt-badge bg-mint/20 text-mint">Completed</span> : <span className="gt-badge bg-gold/20 text-gold">In progress</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="text-center text-[var(--muted)] py-8">No data yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
