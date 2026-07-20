import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUser, nextUnlockedLesson } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";
import { EnrolButton } from "@/components/enrol-button";
import { getMissingPrerequisites } from "@/lib/course-prereqs";
import { EmptyState, PageHeader } from "@/components/page-ui";

export default async function CoursePage({ params }: { params: { courseId: string } }) {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, include: { quiz: true, video: true } } } },
    },
  });
  if (!course) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
  });
  if (!enrollment && session.user.roleType !== "SUPER_ADMIN") {
    return (
      <EmptyState
        icon="🔐"
        title="Not enrolled"
        hint="This course isn't assigned to your position — you can still enrol yourself."
        action={<div className="w-40"><EnrolButton courseId={course.id} label="Enrol now" /></div>}
      />
    );
  }

  // Prerequisite gate: enrolled but locked until the required courses are done.
  if (session.user.roleType !== "SUPER_ADMIN") {
    const missing = await getMissingPrerequisites(session.user.id, course.id);
    if (missing.length > 0) {
      return (
        <div className="space-y-5">
        <PageHeader backHref="/trainee/courses" backLabel="My courses" title={course.title} />
        <div className="gt-card p-6">
          <h2 className="text-xl font-bold">🔒 This course is locked</h2>
          <p className="mt-1 text-[var(--muted)]">Complete these courses first:</p>
          <ul className="mt-3 space-y-2">
            {missing.map((m) => (
              <li key={m.id}>
                <Link href={`/trainee/courses/${m.id}`} className="gt-btn-ghost">{m.title} →</Link>
              </li>
            ))}
          </ul>
          <Link href="/trainee" className="gt-btn-ghost mt-4 inline-flex text-xs">← Back to dashboard</Link>
        </div>
        </div>
      );
    }
  }

  const progress = await getCourseProgressForUser(session.user.id, course.id);
  const nextLesson = await nextUnlockedLesson(session.user.id, course.id);
  const certificate = await prisma.certificate.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
  });

  return (
    <div className="space-y-6">
      <PageHeader backHref="/trainee/courses" backLabel="My courses" title={course.title} subtitle={course.description} />
      <div className="gt-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Your progress</div>
          <div className="text-right">
            <div className="text-3xl font-bold text-mint">{progress?.percent ?? 0}%</div>
            <div className="text-xs text-[var(--muted)]">{progress?.completed}/{progress?.total} lessons</div>
          </div>
        </div>
        <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {nextLesson && (
            <Link href={`/trainee/courses/${course.id}/lessons/${nextLesson}`} className="gt-btn-primary">Continue</Link>
          )}
          {certificate && (
            <a href={`/api/certificates/${certificate.id}/download`} className="gt-btn-accent" target="_blank">Download certificate</a>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {course.modules.map((m, mi) => (
          <div key={m.id} className="gt-card p-5">
            <h3 className="font-bold">Module {mi + 1}: {m.title}</h3>
            <ol className="mt-3 divide-y divide-[var(--border)]">
              {m.lessons.map((l, li) => {
                const p = progress?.progressMap.get(l.id);
                const done = p?.videoWatched && p?.quizPassed;
                return (
                  <li key={l.id} className="flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-[var(--soft)]/50">
                    <div>
                      <div className="font-medium">{mi + 1}.{li + 1}  {l.title}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {l.video ? "Video" : "—"} · {l.quiz ? "Quiz" : "No quiz"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {done ? <span className="gt-badge bg-mint/15 text-mint">Done</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">Pending</span>}
                      <Link href={`/trainee/courses/${course.id}/lessons/${l.id}`} className="gt-btn-ghost text-xs">Open</Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
