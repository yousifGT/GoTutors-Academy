import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { formatDate } from "@/lib/utils";

export default async function CourseProgressPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({ where: { id: params.id } });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: course.id },
    include: { user: { include: { centre: true } } },
    orderBy: { enrolledAt: "desc" },
  });

  const rows = await Promise.all(
    enrollments.map(async (e) => {
      const progress = await getCourseProgressForUser(e.userId, course.id);
      const attempts = await prisma.quizAttempt.findMany({
        where: { userId: e.userId, quiz: { lesson: { module: { courseId: course.id } } } },
        select: { passed: true, locked: true },
      });
      const passes = attempts.filter((a) => a.passed).length;
      const fails = attempts.length - passes;
      const locked = attempts.some((a) => a.locked);
      const timeRows = await prisma.progress.findMany({
        where: { userId: e.userId, lesson: { module: { courseId: course.id } } },
        select: { timeSpent: true },
      });
      const timeSpent = timeRows.reduce((s, p) => s + p.timeSpent, 0);
      return { e, progress, passes, fails, locked, timeSpent };
    })
  );

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/instructor/courses/${course.id}`} className="text-sm text-picton">← {course.title}</Link>
        <h2 className="text-2xl font-bold mt-1">Trainee progress · {course.title}</h2>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Trainee</th><th>Centre</th><th>Progress</th><th>Passes</th><th>Fails</th><th>Time</th><th>Last login</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ e, progress, passes, fails, locked, timeSpent }) => (
              <tr key={e.id}>
                <td><div className="font-medium">{e.user.name}</div><div className="text-xs text-[var(--muted)]">{e.user.email}</div></td>
                <td>{e.user.centre?.name ?? "—"}</td>
                <td className="w-56"><div className="flex items-center gap-2"><ProgressBar percent={progress?.percent ?? 0} /><span className="text-xs w-10 text-right">{progress?.percent ?? 0}%</span></div></td>
                <td className="text-mint">{passes}</td>
                <td className="text-orange">{fails}</td>
                <td>{Math.round(timeSpent / 60)}m</td>
                <td>{e.user.lastLoginAt ? formatDate(e.user.lastLoginAt) : "—"}</td>
                <td>
                  {locked ? <span className="gt-badge bg-orange/20 text-orange">Locked</span> :
                    e.completed ? <span className="gt-badge bg-mint/20 text-mint">Completed</span> :
                    <span className="gt-badge bg-gold/20 text-gold">In progress</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-[var(--muted)]">No enrolments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
