import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser, nextUnlockedLesson } from "@/lib/course-progress";
import { syncUserEnrollments } from "@/lib/auto-enrol";
import { getMissingPrerequisites } from "@/lib/course-prereqs";
import { PageHeader, StatStrip, AttentionPanel, EmptyState, type AttentionItem } from "@/components/page-ui";

export default async function TraineeDashboard() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  const userId = session.user.id;

  // Self-healing: pick up any published course matching this trainee's
  // sub-positions that a sync hook missed (e.g. accounts predating
  // auto-enrolment). Idempotent and only ever adds.
  await syncUserEnrollments(userId);

  const [enrollments, certificates, lockedAttempts, pendingReview] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId },
      include: { course: { include: { modules: { include: { lessons: true } } } } },
      orderBy: { enrolledAt: "desc" },
    }),
    prisma.certificate.count({ where: { userId } }),
    prisma.quizAttempt.findMany({
      where: { userId, locked: true },
      select: { quiz: { select: { lesson: { select: { title: true } } } } },
      distinct: ["quizId"],
    }),
    prisma.quizAttempt.count({ where: { userId, needsReview: true, reviewedAt: null } }),
  ]);

  const progressByCourse = await Promise.all(
    enrollments.map(async (e) => ({
      enrollment: e,
      progress: await getCourseProgressForUser(userId, e.courseId),
      missingPrereqs: await getMissingPrerequisites(userId, e.courseId),
    }))
  );

  // "Continue" hero: the most recently enrolled course that's unlocked,
  // started or not, and still incomplete.
  const upNext = progressByCourse.find(
    ({ enrollment, missingPrereqs }) => !enrollment.completed && missingPrereqs.length === 0
  );
  const upNextLesson = upNext ? await nextUnlockedLesson(userId, upNext.enrollment.courseId) : null;

  // ---- Needs your attention (trainee-flavoured) ----
  const attention: AttentionItem[] = [];
  if (lockedAttempts.length > 0)
    attention.push({
      icon: "🔒",
      text: `You're locked out of ${lockedAttempts.length === 1 ? `the “${lockedAttempts[0].quiz.lesson.title}” quiz` : `${lockedAttempts.length} quizzes`}`,
      detail: "You used all attempts. Your centre admin has been notified and can unlock retries.",
      href: "/trainee/courses",
      action: "My courses",
      tone: "orange",
    });
  if (pendingReview > 0)
    attention.push({
      icon: "📝",
      text: `${pendingReview} quiz submission${pendingReview === 1 ? " is" : "s are"} being graded`,
      detail: "An instructor is reviewing your open-ended answers — check back soon.",
      href: "/trainee/courses",
      action: "My courses",
      tone: "gold",
    });
  for (const { enrollment, missingPrereqs } of progressByCourse) {
    if (missingPrereqs.length > 0) {
      attention.push({
        icon: "🧭",
        text: `“${enrollment.course.title}” unlocks after ${missingPrereqs.map((m) => m.title).join(", ")}`,
        href: `/trainee/courses/${missingPrereqs[0].id}`,
        action: "Start prerequisite",
        tone: "picton",
      });
    }
  }

  const firstName = session.user.name?.split(" ")[0] ?? "there";
  const completedCount = enrollments.filter((e) => e.completed).length;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi, ${firstName} 👋`} subtitle="Pick up where you left off." />

      <StatStrip
        items={[
          { label: "Enrolled courses", value: enrollments.length },
          { label: "Completed", value: completedCount },
          { label: "Certificates", value: certificates },
        ]}
      />

      {upNext && (
        <section className="gt-card flex flex-wrap items-center gap-4 border-l-4 border-picton/60 p-6">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Up next</div>
            <div className="mt-1 text-lg font-bold">{upNext.enrollment.course.title}</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="w-48"><ProgressBar percent={upNext.progress?.percent ?? 0} /></div>
              <span className="text-xs text-[var(--muted)]">
                {upNext.progress?.completed ?? 0}/{upNext.progress?.total ?? 0} lessons
              </span>
            </div>
          </div>
          <Link
            href={upNextLesson ? `/trainee/courses/${upNext.enrollment.courseId}/lessons/${upNextLesson}` : `/trainee/courses/${upNext.enrollment.courseId}`}
            className="gt-btn-primary"
          >
            {(upNext.progress?.completed ?? 0) > 0 ? "Continue →" : "Start course →"}
          </Link>
        </section>
      )}

      {attention.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Needs your attention</h3>
          <AttentionPanel items={attention} />
        </section>
      )}

      <section>
        <h3 className="mb-3 text-lg font-bold">My courses</h3>
        {progressByCourse.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No courses yet"
            hint="Courses assigned to your position appear here automatically once published."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {progressByCourse.map(({ enrollment, progress, missingPrereqs }) => (
              <Link key={enrollment.id} href={`/trainee/courses/${enrollment.courseId}`} className={`gt-card p-5 hover:shadow-soft transition ${missingPrereqs.length > 0 ? "opacity-75" : ""}`}>
                {missingPrereqs.length > 0 ? (
                  <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">🔒 Locked</span>
                ) : enrollment.completed ? (
                  <span className="gt-badge bg-mint/15 text-mint">🎓 Completed</span>
                ) : (
                  <span className="gt-badge bg-picton/15 text-picton">{progress?.percent ?? 0}% complete</span>
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
