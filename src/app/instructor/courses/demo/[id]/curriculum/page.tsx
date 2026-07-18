import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { ModuleEditor } from "@/components/module-editor";

export default async function DemoCurriculumPage({ params }: { params: { id: string } }) {
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
      <div>
        <Link href="/instructor/courses/demo" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
      </div>
      <WizardSteps
        current={2}
        links={[
          `/instructor/courses/demo/${course.id}/details`,
          null,
          lessonCount > 0 ? `/instructor/courses/demo/${course.id}/review` : null,
        ]}
      />

      <p className="text-sm text-[var(--muted)]">
        Build the modules and lessons for this course. It stays a draft while you work — publish on the next step.
      </p>

      <ModuleEditor courseId={course.id} modules={course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          order: l.order,
          video: l.video ? { provider: l.video.provider, url: l.video.url } : null,
          quiz: l.quiz ? { id: l.quiz.id, passThreshold: l.quiz.passThreshold, retryLimit: l.quiz.retryLimit, questionsCount: l.quiz.questions.length } : null,
        })),
      }))} />

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <Link href={`/instructor/courses/demo/${course.id}/details`} className="gt-btn-ghost">← Back to details</Link>
        <div className="flex items-center gap-3">
          {lessonCount === 0 && <span className="text-xs text-[var(--muted)]">Add at least one lesson before continuing.</span>}
          <Link
            href={`/instructor/courses/demo/${course.id}/review`}
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
