import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { DemoPublishActions } from "@/components/demo-publish-actions";

export default async function DemoReviewPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, select: { id: true, title: true } } } },
      roleAssignments: { include: { role: true } },
    },
  });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
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
        <Link href="/instructor/courses/demo" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
      </div>
      <WizardSteps current={3} />

      <div className="gt-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Summary</h3>
          <span className={`gt-badge ${course.published ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
            {course.published ? "Published" : "Draft"}
          </span>
        </div>
        {course.description && <p className="text-sm text-[var(--muted)]">{course.description}</p>}
        <dl className="text-sm space-y-2">
          <div className="flex gap-2"><dt className="text-[var(--muted)] w-32 shrink-0">Pass threshold</dt><dd>{course.passThreshold}%</dd></div>
          <div className="flex gap-2">
            <dt className="text-[var(--muted)] w-32 shrink-0">Audience</dt>
            <dd className="flex flex-wrap gap-1">
              {wholeRoles.map((r) => <span key={r} className="gt-badge bg-[var(--soft)]">{r} (everyone)</span>)}
              {traineeSubs.map((s) => <span key={s} className="gt-badge bg-lavender text-magenta">{s}</span>)}
              {wholeRoles.length === 0 && traineeSubs.length === 0 && <span className="text-orange">Nobody yet — go back to Details and assign roles.</span>}
            </dd>
          </div>
          <div className="flex gap-2"><dt className="text-[var(--muted)] w-32 shrink-0">Curriculum</dt><dd>{course.modules.length} module{course.modules.length === 1 ? "" : "s"}, {lessonCount} lesson{lessonCount === 1 ? "" : "s"}</dd></div>
          {!course.published && (
            <div className="flex gap-2"><dt className="text-[var(--muted)] w-32 shrink-0">On publish</dt><dd>{reachCount} trainee{reachCount === 1 ? "" : "s"} will be enrolled automatically</dd></div>
          )}
        </dl>

        {course.modules.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] p-4 text-sm space-y-2">
            {course.modules.map((m, i) => (
              <div key={m.id}>
                <div className="font-medium">Module {i + 1}: {m.title}</div>
                <ul className="ml-4 mt-1 list-disc text-[var(--muted)]">
                  {m.lessons.map((l) => <li key={l.id}>{l.title}</li>)}
                  {m.lessons.length === 0 && <li className="text-orange">No lessons in this module</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
        {lessonCount === 0 && (
          <p className="text-sm text-orange">This course has no lessons yet — trainees would see an empty course. Go back and add some first.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link href={`/instructor/courses/demo/${course.id}/curriculum`} className="gt-btn-ghost">← Back to curriculum</Link>
        <DemoPublishActions courseId={course.id} published={course.published} />
      </div>
    </div>
  );
}
