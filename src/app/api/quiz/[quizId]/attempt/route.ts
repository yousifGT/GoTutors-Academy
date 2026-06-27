import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { maybeAwardCertificate } from "@/lib/certificate";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const AttemptSchema = z.object({ answers: z.record(z.string(), z.string()).default({}) });

/** Thrown inside the attempt transaction to short-circuit with a specific status. */
class AttemptError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

  const parsedBody = await parseJson(req, AttemptSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { answers } = parsedBody.data;

  // Score the submission — a pure function of the quiz questions + answers.
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

  // Read prior attempts, enforce the retry / lock / pass gates, and create the
  // new attempt in ONE serializable transaction so concurrent submissions can't
  // both slip past the retry limit. Gate failures throw AttemptError to roll back.
  let result: { attemptId: string; score: number; passed: boolean; locked: boolean };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const previous = await tx.quizAttempt.findMany({
          where: { userId, quizId: quiz.id },
          orderBy: { createdAt: "desc" },
        });
        if (previous.some((a) => a.locked))
          throw new AttemptError(423, "Quiz is locked — admin unlock required.");
        if (previous.some((a) => a.needsReview && a.reviewedAt === null))
          throw new AttemptError(409, "An earlier attempt is awaiting instructor review.");
        if (previous.some((a) => a.passed)) throw new AttemptError(400, "Already passed.");
        const counted = previous.filter((a) => !a.needsReview).length;
        if (counted >= quiz.retryLimit) throw new AttemptError(423, "Out of attempts.");

        const passed = !needsReview && autoScore >= quiz.passThreshold;
        const totalCountedAfter = counted + (needsReview ? 0 : 1);
        const lockedNow = !needsReview && !passed && totalCountedAfter >= quiz.retryLimit;
        const score = needsReview ? 0 : autoScore;

        const attempt = await tx.quizAttempt.create({
          data: {
            userId,
            quizId: quiz.id,
            score,
            passed,
            locked: lockedNow,
            needsReview,
            answers: answers as Prisma.InputJsonValue,
          },
        });

        if (passed) {
          await tx.progress.upsert({
            where: { userId_lessonId: { userId, lessonId: quiz.lessonId } },
            update: { quizPassed: true },
            create: { userId, lessonId: quiz.lessonId, videoWatched: true, quizPassed: true },
          });
        }
        return { attemptId: attempt.id, score, passed, locked: lockedNow };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    if (e instanceof AttemptError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034")
      return NextResponse.json({ error: "Concurrent submission, please retry." }, { status: 409 });
    throw e;
  }

  const { score, passed, locked: lockedNow } = result;

  if (passed) {
    // Award after the attempt commits — maybeAwardCertificate runs its own transaction.
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

  return NextResponse.json({ attemptId: result.attemptId, score, passed, locked: lockedNow, needsReview });
}
