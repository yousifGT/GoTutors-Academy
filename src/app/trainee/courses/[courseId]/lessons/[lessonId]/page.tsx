import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isLessonUnlocked } from "@/lib/course-progress";
import { shuffle } from "@/lib/shuffle";
import { LessonPlayer } from "@/components/lesson-player";

export default async function LessonPage({ params }: { params: { courseId: string; lessonId: string } }) {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const userId = session.user.id;

  const lesson = await prisma.lesson.findUnique({
    where: { id: params.lessonId },
    include: {
      video: true,
      quiz: { include: { questions: { include: { answers: true }, orderBy: { order: "asc" } } } },
      module: { include: { course: { include: { modules: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } } } } } },
    },
  });
  if (!lesson || lesson.module.courseId !== params.courseId) notFound();

  const unlocked = await isLessonUnlocked(userId, lesson.id);
  if (!unlocked) {
    return (
      <div className="gt-card p-6">
        <h2 className="text-xl font-bold">Lesson locked</h2>
        <p className="mt-1 text-[var(--muted)]">Complete the previous lesson and pass its quiz to unlock this one.</p>
        <Link href={`/trainee/courses/${params.courseId}`} className="gt-btn-primary mt-4">Back to course</Link>
      </div>
    );
  }

  const progress = await prisma.progress.upsert({
    where: { userId_lessonId: { userId, lessonId: lesson.id } },
    update: {},
    create: { userId, lessonId: lesson.id },
  });

  let attempts: { id: string; score: number; passed: boolean; createdAt: Date; locked: boolean; needsReview: boolean }[] = [];
  let locked = false;
  if (lesson.quiz) {
    attempts = await prisma.quizAttempt.findMany({
      where: { userId, quizId: lesson.quiz.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, score: true, passed: true, createdAt: true, locked: true, needsReview: true },
    });
    locked = attempts.some((a) => a.locked);
  }

  // Strip correctness from answers sent to the client, and randomise question +
  // answer order per load so answers can't be shared/eliminated by position.
  // Grading is by stable id server-side, so display order never affects scoring.
  const safeQuiz = lesson.quiz
    ? {
        id: lesson.quiz.id,
        passThreshold: lesson.quiz.passThreshold,
        retryLimit: lesson.quiz.retryLimit,
        questions: shuffle(lesson.quiz.questions).map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          answers: shuffle(q.answers).map((a) => ({ id: a.id, text: a.text })),
        })),
      }
    : null;

  const allLessons = lesson.module.course.modules.flatMap((m) => m.lessons);
  const idx = allLessons.findIndex((l) => l.id === lesson.id);
  const nextLesson = allLessons[idx + 1];

  return (
    <LessonPlayer
      courseId={params.courseId}
      lessonId={lesson.id}
      title={lesson.title}
      content={lesson.content ?? ""}
      video={lesson.video ? { provider: lesson.video.provider, url: lesson.video.url } : null}
      quiz={safeQuiz}
      initialProgress={{ videoWatched: progress.videoWatched, quizPassed: progress.quizPassed }}
      attempts={attempts}
      locked={locked}
      nextLessonId={nextLesson?.id ?? null}
    />
  );
}
