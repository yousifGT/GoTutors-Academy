import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { PublishActions } from "@/components/publish-actions";

export default async function CourseReviewPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, video: { select: { id: true } }, quiz: { select: { id: true, questions: { select: { id: true } } } } },
          },
        },
      },
      roleAssignments: { include: { role: true } },
    },
  });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lessonCount = allLessons.length;
  const missingVideo = allLessons.filter((l) => !l.video).length;
  const missingQuiz = allLessons.filter((l) => !l.quiz || l.quiz.questions.length === 0).length;
  const traineeSubs = [...new Set(course.roleAssignments.filter((r) => r.subPosition).map((r) => r.subPosition as string))];
  const wholeRoles = course.roleAssignments.filter((r) => r.subPosition === null).map((r) => r.role.name);

  // How many trainees will be auto-enrolled on publish (matching, not yet enrolled).
  const traineeRoleIds = [...new Set(course.roleAssignments.filter((r) => r.role.type === "TRAINEE").map((r) => r.roleId))];
  const reachCount = traineeRoleIds.length
    ? await prisma.user.count({
        where: {
          active: true,
          enrollments: { none: { courseId: course.id } },
          OR: traineeRoleIds.map((roleId) => {
            const subs = course.roleAssignments.filter((r) => r.roleId === roleId && r.subPosition).map((r) => r.subPosition as string);
            const wholeRole = course.roleAssignments.some((r) => r.roleId === roleId && r.subPosition === null);
            return {
              roleId,
              ...(wholeRole ? {} : { OR: [{ subPositions: { hasSome: subs } }, { subPosition: { in: subs } }] }),
            };
          }),
        },
      })
    : 0;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/instructor/courses" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
      </div>
      <WizardSteps
        current={3}
        links={[
          `/instructor/courses/${course.id}/details`,
          `/instructor/courses/${course.id}/curriculum`,
          null,
        ]}
      />

      <div className="gt-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Course</h3>
          <span className={`gt-badge ${course.published ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
            {course.published ? "Published" : "Draft"}
          </span>
        </div>
        {course.description && <p className="text-sm text-[var(--muted)]">{course.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Audience:</span>
          {wholeRoles.map((r) => <span key={r} className="gt-badge bg-navy text-white">{r} · everyone</span>)}
          {traineeSubs.map((s) => <span key={s} className="gt-badge bg-magenta text-white">{s}</span>)}
          {wholeRoles.length === 0 && traineeSubs.length === 0 && (
            <Link href={`/instructor/courses/${course.id}/details`} className="text-orange underline">
              Nobody yet — assign an audience in Details
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--muted)]">
          <span>Category: <span className="text-[var(--fg)] font-semibold">{course.category ?? "—"}</span></span>
          <span>Quiz pass threshold: <span className="text-[var(--fg)] font-semibold">{course.passThreshold}%</span></span>
        </div>
      </div>

      <div className="gt-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Curriculum</h3>
          <Link href={`/instructor/courses/${course.id}/curriculum`} className="gt-btn-ghost text-xs">Edit</Link>
        </div>
        {course.modules.length === 0 && <p className="text-sm text-orange">No modules yet.</p>}
        {course.modules.map((m, i) => (
          <div key={m.id} className="rounded-xl border border-[var(--border)] p-4">
            <div className="font-medium text-sm">Module {i + 1}: {m.title}</div>
            <ul className="mt-2 space-y-1.5">
              {m.lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="truncate">{l.title}</span>
                  <span className="ml-auto flex shrink-0 gap-1.5">
                    <span className={`gt-badge ${l.video ? "bg-picton/15 text-picton" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                      {l.video ? "🎬 video" : "no video"}
                    </span>
                    <span className={`gt-badge ${l.quiz && l.quiz.questions.length > 0 ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                      {l.quiz && l.quiz.questions.length > 0 ? `📝 ${l.quiz.questions.length} Qs` : "no quiz"}
                    </span>
                  </span>
                </li>
              ))}
              {m.lessons.length === 0 && <li className="text-sm text-orange">No lessons in this module</li>}
            </ul>
          </div>
        ))}
        {(missingVideo > 0 || missingQuiz > 0) && lessonCount > 0 && (
          <p className="text-xs text-[var(--muted)]">
            Heads up: {missingVideo > 0 ? `${missingVideo} lesson${missingVideo === 1 ? "" : "s"} without a video` : ""}
            {missingVideo > 0 && missingQuiz > 0 ? " · " : ""}
            {missingQuiz > 0 ? `${missingQuiz} without a quiz` : ""}. That&apos;s allowed — those lessons just complete on view.
          </p>
        )}
      </div>

      <div className="gt-card p-6 space-y-3">
        {course.published ? (
          <p className="text-sm">This course is <b className="text-mint">live</b>. Matching trainees are enrolled automatically as they join.</p>
        ) : lessonCount === 0 ? (
          <p className="text-sm text-orange">Add at least one lesson before publishing — trainees would see an empty course.</p>
        ) : (
          <p className="text-sm">
            Ready to go? Publishing enrols <b>{reachCount}</b> matching trainee{reachCount === 1 ? "" : "s"} immediately, and new trainees pick it up as they&apos;re added.
          </p>
        )}
        <PublishActions courseId={course.id} published={course.published} />
      </div>
    </div>
  );
}
