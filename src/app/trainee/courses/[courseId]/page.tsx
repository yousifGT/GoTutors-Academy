import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUser, nextUnlockedLesson } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";
import { EnrolButton } from "@/components/enrol-button";

export default async function CoursePage({ params }: { params: { courseId: string } }) {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
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
      <div className="gt-card p-6">
        <p>You're not enrolled in this course.</p>
        <div className="mt-4 max-w-xs"><EnrolButton courseId={course.id} label="Enrol now" /></div>
      </div>
    );
  }

  const progress = await getCourseProgressForUser(session.user.id, course.id);
  const nextLesson = await nextUnlockedLesson(session.user.id, course.id);
  const certificate = await prisma.certificate.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
  });

  return (
    <div className="space-y-6">
      <div className="gt-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{course.title}</h2>
            <p className="mt-1 text-[var(--muted)] max-w-2xl">{course.description}</p>
          </div>
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
                  <li key={l.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{mi + 1}.{li + 1}  {l.title}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {l.video ? "Video" : "—"} · {l.quiz ? "Quiz" : "No quiz"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {done ? <span className="gt-badge bg-mint/20 text-mint">Done</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">Pending</span>}
                      <Link href={`/trainee/courses/${course.id}/lessons/${l.id}`} className="gt-btn-ghost text-sm">Open</Link>
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
