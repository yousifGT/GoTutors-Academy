import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { recomputeIsTrained } from "@/lib/training";

export async function POST(req: Request, { params }: { params: { quizId: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const userId = session.user.id;

  // Cap quiz submissions to 10 per minute per user (well above legitimate use)
  const rl = rateLimit(`quiz:${userId}:${params.quizId}`, 10, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.quizId },
    include: {
      questions: { include: { answers: true } },
      lesson: { include: { module: { include: { course: true } } } },
    },
  });
  if (!quiz) return NextResponse.json({ error: "quiz not found" }, { status: 404 });

  const lessonProgress = await prisma.progress.findUnique({
    where: { userId_lessonId: { userId, lessonId: quiz.lessonId } },
  });
  if (!lessonProgress?.videoWatched) {
    return NextResponse.json({ error: "Video must be watched first." }, { status: 400 });
  }

  const previous = await prisma.quizAttempt.findMany({ where: { userId, quizId: quiz.id }, orderBy: { createdAt: "desc" } });
  if (previous.some((a) => a.locked)) {
    return NextResponse.json({ error: "Quiz is locked — admin unlock required." }, { status: 423 });
  }
  if (previous.some((a) => a.needsReview && a.reviewedAt === null)) {
    return NextResponse.json({ error: "An earlier attempt is awaiting instructor review." }, { status: 409 });
  }
  const counted = previous.filter((a) => !a.needsReview).length;
  if (counted >= quiz.retryLimit && !previous.some((a) => a.passed)) {
    return NextResponse.json({ error: "Out of attempts." }, { status: 423 });
  }
  if (previous.some((a) => a.passed)) {
    return NextResponse.json({ error: "Already passed." }, { status: 400 });
  }

  const { answers } = (await req.json()) as { answers: Record<string, string> };

  let totalPoints = 0;
  let earned = 0;
  let needsReview = false;
  for (const q of quiz.questions) {
    totalPoints += q.points;
    const submitted = answers?.[q.id];
    if (!submitted) continue;
    if (q.type === "MULTIPLE_CHOICE") {
      const correct = q.answers.find((a) => a.isCorrect);
      if (correct && correct.id === submitted) earned += q.points;
    } else {
      const correctTexts = q.answers.filter((a) => a.isCorrect).map((a) => a.text.trim().toLowerCase());
      const normalized = submitted.trim().toLowerCase();
      if (correctTexts.length > 0 && correctTexts.some((t) => t === normalized)) {
        earned += q.points;
      } else {
        // open-ended answer doesn't match an accepted answer — flag for manual review
        needsReview = true;
      }
    }
  }

  const autoScore = totalPoints === 0 ? 0 : Math.round((earned / totalPoints) * 100);
  // If anything needs review, don't pass/fail or lock yet
  const passed = !needsReview && autoScore >= quiz.passThreshold;
  const totalCountedAfter = counted + (needsReview ? 0 : 1);
  const lockedNow = !needsReview && !passed && totalCountedAfter >= quiz.retryLimit;
  const score = needsReview ? 0 : autoScore;

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      quizId: quiz.id,
      score,
      passed,
      locked: lockedNow,
      needsReview,
      answers: answers as any,
    },
  });

  if (passed) {
    await prisma.progress.upsert({
      where: { userId_lessonId: { userId, lessonId: quiz.lessonId } },
      update: { quizPassed: true },
      create: { userId, lessonId: quiz.lessonId, videoWatched: true, quizPassed: true },
    });

    // Check if course complete -> certificate + notification
    await maybeAwardCertificate(userId, quiz.lesson.module.courseId);
  }

  if (lockedNow) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, centreId: true } });
    if (user?.centreId) {
      await notifyCentreAndInstructor({
        type: "TRAINEE_FAILED",
        title: `${user.name} failed the quiz in "${quiz.lesson.title}"`,
        body: `Final score ${score}%. Course: ${quiz.lesson.module.course.title}.`,
        link: `/centre/trainees/${userId}`,
        centreId: user.centreId,
        courseId: quiz.lesson.module.courseId,
      });
      await notifyCentreAndInstructor({
        type: "RETRY_UNLOCK_NEEDED",
        title: `${user.name} needs a quiz retry unlock`,
        body: `Quiz in lesson "${quiz.lesson.title}" of course "${quiz.lesson.module.course.title}".`,
        link: `/centre/trainees/${userId}`,
        centreId: user.centreId,
        courseId: quiz.lesson.module.courseId,
      });
    }
  }

  if (needsReview) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, centreId: true } });
    if (user?.centreId) {
      await notifyCentreAndInstructor({
        type: "TRAINEE_FAILED",
        title: `${user.name} submitted an open-ended quiz for review`,
        body: `Quiz in lesson "${quiz.lesson.title}" of course "${quiz.lesson.module.course.title}".`,
        link: `/instructor/review`,
        centreId: user.centreId,
        courseId: quiz.lesson.module.courseId,
      });
    }
  }

  return NextResponse.json({ attemptId: attempt.id, score, passed, locked: lockedNow, needsReview });
}

async function maybeAwardCertificate(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: true } } },
  });
  if (!course) return;
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const progressDone = await prisma.progress.count({
    where: { userId, lessonId: { in: lessonIds }, videoWatched: true, quizPassed: true },
  });
  if (progressDone !== lessonIds.length) return;

  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return;
  const serial = "GT-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await prisma.certificate.create({ data: { userId, courseId, serial } });
  await prisma.enrollment.update({
    where: { userId_courseId: { userId, courseId } },
    data: { completed: true, completedAt: new Date() },
  }).catch(() => {});
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
