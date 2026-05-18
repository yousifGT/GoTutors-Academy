import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ReviewQueueItem } from "@/components/review-queue-item";

export default async function ReviewQueuePage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      needsReview: true,
      reviewedAt: null,
      ...(session.user.roleType === "SUPER_ADMIN"
        ? {}
        : { quiz: { lesson: { module: { course: { authorId: session.user.id } } } } }),
    },
    include: {
      user: { include: { centre: true } },
      quiz: {
        include: {
          questions: { include: { answers: true }, orderBy: { order: "asc" } },
          lesson: { include: { module: { include: { course: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Open-ended review queue</h2>
      {attempts.length === 0 && <div className="gt-card p-6 text-[var(--muted)]">Nothing waiting for review.</div>}
      <div className="space-y-4">
        {attempts.map((a) => (
          <ReviewQueueItem
            key={a.id}
            attempt={{
              id: a.id,
              createdAt: a.createdAt.toISOString(),
              userName: a.user.name,
              userEmail: a.user.email,
              courseTitle: a.quiz.lesson.module.course.title,
              lessonTitle: a.quiz.lesson.title,
              passThreshold: a.quiz.passThreshold,
              answers: a.answers as Record<string, string>,
              questions: a.quiz.questions.map((q) => ({
                id: q.id,
                type: q.type,
                prompt: q.prompt,
                points: q.points,
                answers: q.answers.map((ans) => ({ id: ans.id, text: ans.text, isCorrect: ans.isCorrect })),
              })),
            }}
          />
        ))}
      </div>
    </div>
  );
}
