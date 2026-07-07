import { prisma } from "@/lib/prisma";

export type CourseProgressSummary = { total: number; completed: number; percent: number };

/**
 * Batched course progress for many (userId, courseId) pairs in TWO queries total
 * (vs two per pair via getCourseProgressForUser in a loop). Returns a Map keyed
 * by `${userId}:${courseId}`. Use this on any page that renders progress for a
 * list of enrolments.
 */
export async function getCourseProgressForUsers(
  pairs: { userId: string; courseId: string }[]
): Promise<Map<string, CourseProgressSummary>> {
  const result = new Map<string, CourseProgressSummary>();
  if (pairs.length === 0) return result;

  const courseIds = Array.from(new Set(pairs.map((p) => p.courseId)));
  const userIds = Array.from(new Set(pairs.map((p) => p.userId)));

  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId: { in: courseIds } } },
    select: { id: true, module: { select: { courseId: true } } },
  });
  const lessonsByCourse = new Map<string, string[]>();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.module.courseId) ?? [];
    arr.push(l.id);
    lessonsByCourse.set(l.module.courseId, arr);
  }

  const done = await prisma.progress.findMany({
    where: { userId: { in: userIds }, lessonId: { in: lessons.map((l) => l.id) }, videoWatched: true, quizPassed: true },
    select: { userId: true, lessonId: true },
  });
  const doneSet = new Set(done.map((p) => `${p.userId}:${p.lessonId}`));

  for (const { userId, courseId } of pairs) {
    const lessonIds = lessonsByCourse.get(courseId) ?? [];
    const completed = lessonIds.reduce((n, lid) => (doneSet.has(`${userId}:${lid}`) ? n + 1 : n), 0);
    const total = lessonIds.length;
    result.set(`${userId}:${courseId}`, {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    });
  }
  return result;
}

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
