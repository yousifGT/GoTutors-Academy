import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";
import { PageHeader, EmptyState, Avatar } from "@/components/page-ui";

export default async function InstructorProgressPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const where = session.user.roleType === "SUPER_ADMIN" ? {} : { course: { authorId: session.user.id } };
  const enrollments = await prisma.enrollment.findMany({
    where,
    include: { user: true, course: true },
    orderBy: { enrolledAt: "desc" },
    take: 200,
  });
  // Batched: two queries for all rows instead of two per enrolment.
  const progressByKey = await getCourseProgressForUsers(
    enrollments.map((e) => ({ userId: e.userId, courseId: e.courseId }))
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Trainee progress" subtitle="The latest 200 enrolments across your courses." />
      {enrollments.length === 0 ? (
        <EmptyState icon="📊" title="No enrolments yet" hint="Trainee progress appears here once people enrol in your courses." />
      ) : (
      <div className="gt-card overflow-hidden">
      <table className="gt-table">
        <thead><tr><th>Trainee</th><th>Course</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>
          {enrollments.map((e) => {
            const percent = progressByKey.get(`${e.userId}:${e.courseId}`)?.percent ?? 0;
            return (
            <tr key={e.id}>
              <td>
                <div className="flex items-center gap-3">
                  <Avatar name={e.user.name} size="sm" />
                  <div className="min-w-0">
                    <div className="font-medium">{e.user.name}</div>
                    <div className="text-xs text-[var(--muted)]">{e.user.email}</div>
                  </div>
                </div>
              </td>
              <td>{e.course.title}</td>
              <td className="w-64">
                <div className="flex items-center gap-3">
                  <ProgressBar percent={percent} />
                  <span className="text-xs w-10 text-right">{percent}%</span>
                </div>
              </td>
              <td>{e.completed ? <span className="gt-badge bg-mint/15 text-mint">Completed</span> : <span className="gt-badge bg-gold/15 text-gold">In progress</span>}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}
