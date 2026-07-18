import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { DemoLessonEditor } from "@/components/demo-lesson-editor";

/** Demo-flow lesson content editor (video + quiz), styled to match the wizard. */
export default async function DemoLessonEditPage({ params }: { params: { id: string; lessonId: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const lesson = await prisma.lesson.findUnique({
    where: { id: params.lessonId },
    include: {
      video: true,
      quiz: { include: { questions: { include: { answers: true }, orderBy: { order: "asc" } } } },
      module: { include: { course: true } },
    },
  });
  if (!lesson || lesson.module.courseId !== params.id) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && lesson.module.course.authorId !== session.user.id) notFound();

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href={`/instructor/courses/demo/${params.id}/curriculum`} className="text-sm text-picton">← Back to curriculum</Link>
        <h2 className="text-2xl font-bold mt-1">{lesson.title}</h2>
        <p className="text-sm text-[var(--muted)]">{lesson.module.course.title} · {lesson.module.title}</p>
      </div>
      <DemoLessonEditor
        courseId={params.id}
        lessonId={lesson.id}
        title={lesson.title}
        content={lesson.content ?? ""}
        video={lesson.video ? { provider: lesson.video.provider, url: lesson.video.url } : null}
        quiz={lesson.quiz ? {
          id: lesson.quiz.id,
          passThreshold: lesson.quiz.passThreshold,
          retryLimit: lesson.quiz.retryLimit,
          questions: lesson.quiz.questions.map((q) => ({
            id: q.id,
            type: q.type as "MULTIPLE_CHOICE" | "OPEN_ENDED",
            prompt: q.prompt,
            points: q.points,
            answers: q.answers.map((a) => ({ id: a.id, text: a.text, isCorrect: a.isCorrect })),
          })),
        } : null}
      />
    </div>
  );
}
