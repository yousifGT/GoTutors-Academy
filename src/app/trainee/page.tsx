import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { syncUserEnrollments } from "@/lib/auto-enrol";
import { getMissingPrerequisites } from "@/lib/course-prereqs";
import { PageHeader, StatCard } from "@/components/page-ui";

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
      missingPrereqs: await getMissingPrerequisites(userId, e.courseId),
    }))
  );

  const firstName = session.user.name?.split(" ")[0] ?? "there";
  return (
    <div className="space-y-8">
      <PageHeader title={`Hi, ${firstName} 👋`} subtitle="Pick up where you left off." />
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Enrolled courses" value={enrollments.length} icon="📚" tone="navy" />
        <StatCard label="Certificates" value={certificates} icon="🎓" tone="mint" />
        <StatCard label="Completed" value={enrollments.filter((e) => e.completed).length} icon="✅" tone="picton" />
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">My courses</h2>
        {progressByCourse.length === 0 ? (
          <div className="gt-card p-6 text-[var(--muted)]">No courses assigned to your position yet — they appear here automatically once published.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {progressByCourse.map(({ enrollment, progress, missingPrereqs }) => (
              <Link key={enrollment.id} href={`/trainee/courses/${enrollment.courseId}`} className={`gt-card p-5 hover:shadow-soft transition ${missingPrereqs.length > 0 ? "opacity-75" : ""}`}>
                {missingPrereqs.length > 0 ? (
                  <div className="text-sm font-semibold text-[var(--muted)]">🔒 Locked</div>
                ) : (
                  <div className="text-sm text-picton font-semibold">{progress?.percent ?? 0}% complete</div>
                )}
                <div className="mt-1 text-lg font-bold">{enrollment.course.title}</div>
                <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{enrollment.course.description}</p>
                {missingPrereqs.length > 0 ? (
                  <div className="mt-4 text-xs text-[var(--muted)]">
                    Complete <span className="text-[var(--fg)]">{missingPrereqs.map((m) => m.title).join(", ")}</span> first
                  </div>
                ) : (
                  <>
                    <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
                    <div className="mt-3 text-xs text-[var(--muted)]">{progress?.completed}/{progress?.total} lessons</div>
                  </>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
