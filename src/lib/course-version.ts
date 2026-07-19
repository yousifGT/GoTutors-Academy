import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Capture an immutable snapshot of a course's current structure and bump its
 * version. Called on every publish, so certificates (which record the version
 * they were awarded against) always point at exactly what trainees saw, even
 * after the live course is edited. Returns the new version number.
 */
export async function snapshotCourse(courseId: string): Promise<number> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: {
              video: true,
              quiz: { include: { questions: { orderBy: { order: "asc" }, include: { answers: true } } } },
            },
          },
        },
      },
    },
  });
  if (!course) throw new Error(`snapshotCourse: course ${courseId} not found`);

  const snapshot = {
    title: course.title,
    description: course.description,
    category: course.category,
    passThreshold: course.passThreshold,
    modules: course.modules.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        content: l.content,
        video: l.video ? { provider: l.video.provider, url: l.video.url } : null,
        quiz: l.quiz
          ? {
              passThreshold: l.quiz.passThreshold,
              retryLimit: l.quiz.retryLimit,
              questions: l.quiz.questions.map((q) => ({
                type: q.type,
                prompt: q.prompt,
                points: q.points,
                answers: q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })),
              })),
            }
          : null,
      })),
    })),
  } satisfies Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.course.update({
      where: { id: courseId },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    await tx.courseVersion.create({ data: { courseId, version: updated.version, snapshot } });
    return updated.version;
  });
}
