import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { CurriculumBuilder } from "@/components/curriculum-builder";

export default async function CourseCurriculumPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, include: { video: true, quiz: { include: { questions: { include: { answers: true } } } } } } } },
    },
  });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/instructor/courses" className="text-sm text-picton">← Courses</Link>
          <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
        </div>
        <div className="flex gap-2">
          <Link href={`/instructor/courses/${course.id}/enrol`} className="gt-btn-ghost text-sm">Bulk enrol</Link>
          <Link href={`/instructor/courses/${course.id}/progress`} className="gt-btn-ghost text-sm">Trainee progress</Link>
        </div>
      </div>
      <WizardSteps
        current={2}
        links={[
          `/instructor/courses/${course.id}/details`,
          null,
          lessonCount > 0 ? `/instructor/courses/${course.id}/review` : null,
        ]}
      />

      <p className="text-sm text-[var(--muted)]">
        Drag <span className="text-[var(--fg)]">⠿</span> to reorder, click a title to rename, press Enter to add in bulk.
        {!course.published && " It all stays a draft — publish on the next step."}
      </p>

      <CurriculumBuilder courseId={course.id} modules={course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          video: l.video ? { provider: l.video.provider } : null,
          quiz: l.quiz ? { passThreshold: l.quiz.passThreshold, questionsCount: l.quiz.questions.length } : null,
        })),
      }))} />

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <Link href={`/instructor/courses/${course.id}/details`} className="gt-btn-ghost">← Back to details</Link>
        <div className="flex items-center gap-3">
          {lessonCount === 0 && <span className="text-xs text-[var(--muted)]">Add at least one lesson before continuing.</span>}
          <Link
            href={`/instructor/courses/${course.id}/review`}
            className={lessonCount === 0 ? "gt-btn-ghost pointer-events-none opacity-50" : "gt-btn-primary"}
            aria-disabled={lessonCount === 0}
          >
            Continue to review →
          </Link>
        </div>
      </div>
    </div>
  );
}
