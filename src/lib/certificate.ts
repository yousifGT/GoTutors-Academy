import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { recomputeIsTrained } from "@/lib/training";

/**
 * Award a course-completion certificate iff the user has finished every lesson in
 * the course and doesn't already hold one. Idempotent and concurrency-safe:
 *
 *  - the certificate insert + enrollment completion run in one transaction, so a
 *    certificate never exists without its enrollment marked complete;
 *  - a duplicate (the unique [userId, courseId] constraint firing because two
 *    passing submissions land together) is caught and treated as already-awarded
 *    rather than surfacing as an uncaught 500.
 *
 * Safe to call on every quiz pass. Shared by the attempt and review routes.
 */
export async function maybeAwardCertificate(userId: string, courseId: string): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: { select: { id: true } } } } },
  });
  if (!course) return;
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  if (lessonIds.length === 0) return;

  const progressDone = await prisma.progress.count({
    where: { userId, lessonId: { in: lessonIds }, videoWatched: true, quizPassed: true },
  });
  if (progressDone !== lessonIds.length) return;

  const serial = "GT-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  let awarded = false;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
      if (existing) return;
      // Pin the certificate to the course version it was earned against.
      await tx.certificate.create({ data: { userId, courseId, serial, courseVersion: course.version } });
      const res = await tx.enrollment.updateMany({
        where: { userId, courseId },
        data: { completed: true, completedAt: new Date() },
      });
      // A certificate with no enrollment to complete is an integrity anomaly
      // (progress shouldn't exist without enrollment) — surface it, don't swallow.
      if (res.count === 0)
        console.error("certificate awarded but no enrollment found to complete", { userId, courseId });
      awarded = true;
    });
  } catch (e) {
    // Another concurrent pass inserted the certificate first — treat as done.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
  if (!awarded) return;

  await recomputeIsTrained(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, centreId: true } });
  if (user?.centreId) {
    await notifyCentreAndInstructor({
      type: "TRAINEE_PASSED",
      title: `${user.name} completed ${course.title}`,
      link: `/centre/trainees/${userId}`,
      centreId: user.centreId,
      courseId,
    });
  }
}
