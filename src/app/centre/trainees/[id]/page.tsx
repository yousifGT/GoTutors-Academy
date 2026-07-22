import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProgressBar } from "@/components/progress-bar";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { UnlockButton } from "@/components/unlock-button";
import { formatDate } from "@/lib/utils";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { timeAgo } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/page-ui";

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
              roleAssignments: { select: { subPosition: true, role: { select: { name: true } } } },
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

  // Group courses under the training fields they serve. A course counting
  // towards several of the trainee's fields appears under EACH of them
  // (mirroring how training completion is counted); courses serving none of
  // their fields go under the course's own first field, else "General".
  const GENERAL = "__general__";
  const userFields = effectiveSubPositions(user);
  const courseFields = (e: (typeof user.enrollments)[number]) =>
    [...new Set(e.course.roleAssignments.filter((ra) => ra.subPosition).map((ra) => ra.subPosition as string))];
  const groupsOf = (e: (typeof user.enrollments)[number]) => {
    const fields = courseFields(e);
    const mine = fields.filter((f) => userFields.includes(f));
    return mine.length > 0 ? mine : [fields[0] ?? GENERAL];
  };
  const groupKeys: string[] = [];
  for (const f of userFields) if (rows.some(({ e }) => groupsOf(e).includes(f))) groupKeys.push(f);
  for (const { e } of rows) {
    for (const g of groupsOf(e)) if (g !== GENERAL && !groupKeys.includes(g)) groupKeys.push(g);
  }
  if (rows.some(({ e }) => groupsOf(e).includes(GENERAL))) groupKeys.push(GENERAL);

  const lockedAttempts = await prisma.quizAttempt.findMany({
    where: { userId: user.id, locked: true },
    include: { quiz: { include: { lesson: { include: { module: { include: { course: true } } } } } } },
  });

  const certs = await prisma.certificate.findMany({ where: { userId: user.id }, include: { course: true } });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/centre/trainees"
        backLabel="Trainees"
        title={user.name}
        actions={<Link href={`/centre/trainees/${user.id}/edit`} className="gt-btn-ghost text-sm">Edit</Link>}
      />
      <div className="gt-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-picton to-cyan text-lg font-bold text-navy">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-sm text-[var(--muted)]">
              {user.email} · {user.role.name}
              {effectiveSubPositions(user).length ? ` · ${effectiveSubPositions(user).join(", ")}` : user.position ? ` · ${user.position}` : ""}
              {" "}· {user.centre?.name ?? "no centre"}
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">Last login: {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</p>
            </div>
          </div>
          <span className="flex gap-2">
            {!user.active && <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
            {user.isTrained
              ? <span className="gt-badge bg-mint/15 text-mint">Trained</span>
              : <span className="gt-badge bg-gold/15 text-gold">In training</span>}
          </span>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-bold mb-2">Course progress</h3>
        <div className="space-y-5">
          {groupKeys.map((k) => {
            const groupRows = rows.filter(({ e }) => groupsOf(e).includes(k));
            const doneCount = groupRows.filter(({ e }) => e.completed).length;
            return (
              <details key={k} open={doneCount < groupRows.length} className="group/sec">
                <summary className="mb-2 flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 py-1 transition hover:bg-[var(--soft)]/40 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--muted)] transition-transform group-open/sec:rotate-90">▶</span>
                    {k === GENERAL
                      ? <span className="gt-badge bg-navy/10 text-navy dark:bg-ice/10 dark:text-ice">📚 General</span>
                      : <span className="gt-badge bg-magenta/15 text-magenta">🧩 {k}</span>}
                  </span>
                  <span className={`text-xs font-bold ${doneCount === groupRows.length ? "text-mint" : "text-[var(--muted)]"}`}>
                    {doneCount}/{groupRows.length} completed{doneCount === groupRows.length ? " 🏅" : ""}
                  </span>
                </summary>
                <div className="space-y-3">
                  {groupRows.map(({ e, progress }) => {
                    const totalSeconds = e.course.modules
                      .flatMap((m) => m.lessons)
                      .reduce((sum, l) => sum + (progressByLesson.get(l.id)?.timeSpent ?? 0), 0);
                    const fields = courseFields(e);
                    const roleWide = [...new Set(e.course.roleAssignments.filter((ra) => ra.subPosition === null).map((ra) => ra.role.name))];
                    return (
                      <details key={e.id} className="gt-card p-4">
                        <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none">
                          <div className="min-w-0">
                            <div className="font-semibold">{e.course.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {fields.map((f) => (
                                <span key={f} className={`gt-badge ${f === k ? "bg-magenta/15 text-magenta" : "bg-[var(--soft)] text-[var(--muted)]"}`}>{f}</span>
                              ))}
                              {roleWide.map((r) => (
                                <span key={r} className="gt-badge bg-navy/10 text-navy dark:bg-ice/10 dark:text-ice">{r} · everyone</span>
                              ))}
                              <span className="text-xs text-[var(--muted)]">· Time spent: {Math.round(totalSeconds / 60)} min</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-40"><ProgressBar percent={progress?.percent ?? 0} /></div>
                            <span className="text-xs w-10 text-right">{progress?.percent ?? 0}%</span>
                            {e.completed ? <span className="gt-badge bg-mint/15 text-mint">Completed</span> : <span className="gt-badge bg-gold/15 text-gold">In progress</span>}
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
                                    <span className={`gt-badge ${p?.videoWatched ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>Video</span>
                                    <span className={`gt-badge ${p?.quizPassed ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>Quiz</span>
                                  </div>
                                </div>
                              );
                            }))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
          {rows.length === 0 && <EmptyState icon="📚" title="No enrolments yet" hint="Courses matching their sub-positions appear here once published." />}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-bold mb-2">Locked quizzes</h3>
        {lockedAttempts.length === 0 ? (
          <EmptyState icon="🔓" title="No locked quizzes" hint="Trainees who use up all their quiz attempts show up here for an unlock." />
        ) : (
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
            </tbody>
          </table>
        </div>
        )}
      </section>

      <section>
        <h3 className="text-lg font-bold mb-2">Certificates</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {certs.map((c) => (
            <div key={c.id} className="gt-card p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.course.title}</div>
                <div className="text-xs text-[var(--muted)]">Serial {c.serial} · {formatDate(c.issuedAt)}</div>
              </div>
              <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost text-xs">Download</Link>
            </div>
          ))}
          {certs.length === 0 && <div className="md:col-span-2"><EmptyState icon="🎓" title="No certificates yet" hint="Certificates appear here when courses are completed." /></div>}
        </div>
      </section>
    </div>
  );
}
