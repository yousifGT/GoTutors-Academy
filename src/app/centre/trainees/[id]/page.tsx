import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { UnlockButton } from "@/components/unlock-button";
import { formatDate } from "@/lib/utils";
import { effectiveSubPositions } from "@/lib/sub-positions";

export default async function TraineeDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      centre: true,
      role: true,
      enrollments: {
        include: {
          course: {
            include: {
              modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!user) notFound();
  if (session.user.roleType === "CENTRE_ADMIN" && user.centreId !== session.user.centreId) notFound();

  const allLessonIds = user.enrollments.flatMap((e) => e.course.modules.flatMap((m) => m.lessons.map((l) => l.id)));
  const allProgress = await prisma.progress.findMany({
    where: { userId: user.id, lessonId: { in: allLessonIds } },
  });
  const progressByLesson = new Map(allProgress.map((p) => [p.lessonId, p]));

  const rows = await Promise.all(
    user.enrollments.map(async (e) => ({
      e,
      progress: await getCourseProgressForUser(user.id, e.courseId),
    }))
  );

  const lockedAttempts = await prisma.quizAttempt.findMany({
    where: { userId: user.id, locked: true },
    include: { quiz: { include: { lesson: { include: { module: { include: { course: true } } } } } } },
  });

  const certs = await prisma.certificate.findMany({ where: { userId: user.id }, include: { course: true } });

  return (
    <div className="space-y-6">
      <div className="gt-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-sm text-[var(--muted)]">
              {user.email} · {user.role.name}
              {effectiveSubPositions(user).length ? ` · ${effectiveSubPositions(user).join(", ")}` : user.position ? ` · ${user.position}` : ""}
              {" "}· {user.centre?.name ?? "no centre"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</p>
          </div>
          {user.isTrained && <span className="gt-badge bg-mint/20 text-mint">Trained</span>}
        </div>
      </div>

      <section>
        <h3 className="font-bold mb-2">Course progress</h3>
        <div className="space-y-4">
          {rows.map(({ e, progress }) => {
            const totalSeconds = e.course.modules
              .flatMap((m) => m.lessons)
              .reduce((sum, l) => sum + (progressByLesson.get(l.id)?.timeSpent ?? 0), 0);
            return (
              <details key={e.id} className="gt-card p-4">
                <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none">
                  <div>
                    <div className="font-semibold">{e.course.title}</div>
                    <div className="text-xs text-[var(--muted)]">Time spent: {Math.round(totalSeconds / 60)} min</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-40"><ProgressBar percent={progress?.percent ?? 0} /></div>
                    <span className="text-xs w-10 text-right">{progress?.percent ?? 0}%</span>
                    {e.completed ? <span className="gt-badge bg-mint/20 text-mint">Completed</span> : <span className="gt-badge bg-gold/20 text-gold">In progress</span>}
                  </div>
                </summary>
                <div className="mt-3 divide-y divide-[var(--border)]">
                  {e.course.modules.flatMap((m, mi) =>
                    m.lessons.map((l, li) => {
                      const p = progressByLesson.get(l.id);
                      return (
                        <div key={l.id} className="py-2 flex items-center justify-between text-sm">
                          <div>
                            <span className="text-[var(--muted)] mr-2">{mi + 1}.{li + 1}</span>
                            {l.title}
                          </div>
                          <div className="flex gap-2">
                            <span className={`gt-badge ${p?.videoWatched ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>Video</span>
                            <span className={`gt-badge ${p?.quizPassed ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>Quiz</span>
                          </div>
                        </div>
                      );
                    }))}
                </div>
              </details>
            );
          })}
          {rows.length === 0 && <div className="gt-card p-6 text-[var(--muted)]">No enrolments.</div>}
        </div>
      </section>

      <section>
        <h3 className="font-bold mb-2">Locked quizzes</h3>
        <div className="gt-card overflow-hidden">
          <table className="gt-table">
            <thead><tr><th>Course / Lesson</th><th>Last score</th><th></th></tr></thead>
            <tbody>
              {lockedAttempts.map((a) => (
                <tr key={a.id}>
                  <td>{a.quiz.lesson.module.course.title} · {a.quiz.lesson.title}</td>
                  <td>{a.score}%</td>
                  <td className="text-right"><UnlockButton userId={user.id} quizId={a.quizId} /></td>
                </tr>
              ))}
              {lockedAttempts.length === 0 && <tr><td colSpan={3} className="text-center text-[var(--muted)] py-6">None.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-bold mb-2">Certificates</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {certs.map((c) => (
            <div key={c.id} className="gt-card p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.course.title}</div>
                <div className="text-xs text-[var(--muted)]">Serial {c.serial} · {formatDate(c.issuedAt)}</div>
              </div>
              <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost text-sm">Download</Link>
            </div>
          ))}
          {certs.length === 0 && <div className="text-sm text-[var(--muted)]">No certificates yet.</div>}
        </div>
      </section>
    </div>
  );
}
