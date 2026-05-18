import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { EnrolButton } from "@/components/enrol-button";
import { getCourseProgressForUser } from "@/lib/course-progress";

export default async function TraineeDashboard() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const userId = session.user.id;

  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: { course: { include: { modules: { include: { lessons: true } } } } },
    orderBy: { enrolledAt: "desc" },
  });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { subPosition: true } });
  const availableCourses = await prisma.course.findMany({
    where: {
      published: true,
      enrollments: { none: { userId } },
      roleAssignments: {
        some: {
          roleId: session.user.roleId,
          OR: [
            { subPosition: null },
            ...(me?.subPosition ? [{ subPosition: me.subPosition }] : []),
          ],
        },
      },
    },
    take: 6,
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
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Available to you</div>
          <div className="mt-2 text-3xl font-bold text-picton">{availableCourses.length}</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">My courses</h2>
        {progressByCourse.length === 0 ? (
          <div className="gt-card p-6 text-[var(--muted)]">No enrolments yet. Browse available courses below.</div>
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

      <section>
        <h2 className="text-lg font-bold mb-3">Available for your position</h2>
        {availableCourses.length === 0 ? (
          <div className="gt-card p-6 text-[var(--muted)]">No new courses available right now.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availableCourses.map((course) => (
              <div key={course.id} className="gt-card p-5">
                <div className="text-lg font-bold">{course.title}</div>
                <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{course.description}</p>
                <div className="mt-4"><EnrolButton courseId={course.id} /></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
