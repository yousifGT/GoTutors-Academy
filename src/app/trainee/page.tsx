import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { syncUserEnrollments } from "@/lib/auto-enrol";

export default async function TraineeDashboard() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const userId = session.user.id;

  // Self-healing: pick up any published course matching this trainee's
  // sub-positions that a sync hook missed (e.g. accounts predating
  // auto-enrolment). Idempotent and only ever adds.
  await syncUserEnrollments(userId);

  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: { course: { include: { modules: { include: { lessons: true } } } } },
    orderBy: { enrolledAt: "desc" },
  });

  const certificates = await prisma.certificate.count({ where: { userId } });

  const progressByCourse = await Promise.all(
    enrollments.map(async (e) => ({
      enrollment: e,
      progress: await getCourseProgressForUser(userId, e.courseId),
    }))
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="gt-card p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Enrolled courses</div>
          <div className="mt-2 text-3xl font-bold text-navy dark:text-ice">{enrollments.length}</div>
        </div>
        <div className="gt-card p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Certificates</div>
          <div className="mt-2 text-3xl font-bold text-mint">{certificates}</div>
        </div>
        <div className="gt-card p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Completed</div>
          <div className="mt-2 text-3xl font-bold text-picton">{enrollments.filter((e) => e.completed).length}</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">My courses</h2>
        {progressByCourse.length === 0 ? (
          <div className="gt-card p-6 text-[var(--muted)]">No courses assigned to your position yet — they appear here automatically once published.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {progressByCourse.map(({ enrollment, progress }) => (
              <Link key={enrollment.id} href={`/trainee/courses/${enrollment.courseId}`} className="gt-card p-5 hover:shadow-soft transition">
                <div className="text-sm text-picton font-semibold">{progress?.percent ?? 0}% complete</div>
                <div className="mt-1 text-lg font-bold">{enrollment.course.title}</div>
                <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{enrollment.course.description}</p>
                <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
                <div className="mt-3 text-xs text-[var(--muted)]">{progress?.completed}/{progress?.total} lessons</div>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
