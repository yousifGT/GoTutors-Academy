import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { recomputeIsTrained } from "@/lib/training";
import crypto from "crypto";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const ReviewSchema = z.object({
  grades: z.record(z.string(), z.boolean()).default({}),
  note: z.string().max(5000).nullish(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: params.id },
    include: {
      quiz: {
        include: {
          questions: { include: { answers: true } },
          lesson: { include: { module: { include: { course: true } } } },
        },
      },
      user: { select: { id: true, name: true, centreId: true } },
    },
  });
  if (!attempt) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!attempt.needsReview || attempt.reviewedAt)
    return NextResponse.json({ error: "Already reviewed" }, { status: 400 });

  // authorize: course author or super admin
  if (session.user.roleType !== "SUPER_ADMIN" && attempt.quiz.lesson.module.course.authorId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = await parseJson(req, ReviewSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { grades, note } = parsedBody.data;

  let totalPoints = 0;
  let earned = 0;
  const submitted = attempt.answers as Record<string, string>;

  for (const q of attempt.quiz.questions) {
    totalPoints += q.points;
    const submittedAnswer = submitted?.[q.id];
    if (q.type === "MULTIPLE_CHOICE") {
      const correct = q.answers.find((a) => a.isCorrect);
      if (correct && submittedAnswer === correct.id) earned += q.points;
    } else {
      if (grades?.[q.id]) earned += q.points;
    }
  }

  const score = totalPoints === 0 ? 0 : Math.round((earned / totalPoints) * 100);
  const passed = score >= attempt.quiz.passThreshold;

  // check for lockout: count this attempt + prior non-review attempts
  const others = await prisma.quizAttempt.count({
    where: { userId: attempt.userId, quizId: attempt.quizId, needsReview: false },
  });
  const countedNow = others + 1;
  const locked = !passed && countedNow >= attempt.quiz.retryLimit;

  await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      needsReview: false,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      reviewNote: note ?? null,
      score,
      passed,
      locked,
    },
  });

  if (passed) {
    await prisma.progress.upsert({
      where: { userId_lessonId: { userId: attempt.userId, lessonId: attempt.quiz.lessonId } },
      update: { quizPassed: true },
      create: { userId: attempt.userId, lessonId: attempt.quiz.lessonId, videoWatched: true, quizPassed: true },
    });
    await maybeAwardCertificate(attempt.userId, attempt.quiz.lesson.module.courseId);
  }

  if (locked && attempt.user.centreId) {
    await notifyCentreAndInstructor({
      type: "TRAINEE_FAILED",
      title: `${attempt.user.name} failed the quiz in "${attempt.quiz.lesson.title}"`,
      body: `Final score ${score}%.`,
      link: `/centre/trainees/${attempt.userId}`,
      centreId: attempt.user.centreId,
      courseId: attempt.quiz.lesson.module.courseId,
    });
    await notifyCentreAndInstructor({
      type: "RETRY_UNLOCK_NEEDED",
      title: `${attempt.user.name} needs a quiz retry unlock`,
      body: `Quiz in lesson "${attempt.quiz.lesson.title}".`,
      link: `/centre/trainees/${attempt.userId}`,
      centreId: attempt.user.centreId,
      courseId: attempt.quiz.lesson.module.courseId,
    });
  }

  return NextResponse.json({ ok: true, score, passed, locked });
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
