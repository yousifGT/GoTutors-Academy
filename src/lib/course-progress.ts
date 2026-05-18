import { prisma } from "@/lib/prisma";

export async function getCourseProgressForUser(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: true }, orderBy: { order: "asc" } } },
  });
  if (!course) return null;

  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const progress = await prisma.progress.findMany({
    where: { userId, lessonId: { in: lessonIds } },
  });
  const map = new Map(progress.map((p) => [p.lessonId, p]));
  const completed = progress.filter((p) => p.videoWatched && p.quizPassed).length;
  return {
    total: lessonIds.length,
    completed,
    percent: lessonIds.length === 0 ? 0 : Math.round((completed / lessonIds.length) * 100),
    progressMap: map,
  };
}

export async function nextUnlockedLesson(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } } },
  });
  if (!course) return null;
  const ordered = course.modules.flatMap((m) => m.lessons);
  const progress = await prisma.progress.findMany({ where: { userId, lessonId: { in: ordered.map((l) => l.id) } } });
  const pMap = new Map(progress.map((p) => [p.lessonId, p]));
  for (const lesson of ordered) {
    const p = pMap.get(lesson.id);
    if (!p?.videoWatched || !p?.quizPassed) return lesson.id;
  }
  return null;
}

export async function isLessonUnlocked(userId: string, lessonId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: { include: { modules: { include: { lessons: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } } } } } } },
  });
  if (!lesson) return false;
  const all = lesson.module.course.modules.flatMap((m) => m.lessons);
  const idx = all.findIndex((l) => l.id === lessonId);
  if (idx === 0) return true;
  const prev = all[idx - 1];
  const prevProgress = await prisma.progress.findUnique({
    where: { userId_lessonId: { userId, lessonId: prev.id } },
  });
  return !!(prevProgress?.videoWatched && prevProgress?.quizPassed);
}
