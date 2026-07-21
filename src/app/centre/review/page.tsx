import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { getFieldStatusForUsers } from "@/lib/field-training";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { PageHeader, StatCard } from "@/components/page-ui";
import {
  CentreReviewBoard,
  PromoteCandidate,
  LockedItem,
  GhostItem,
  NoPositionItem,
  StalledItem,
} from "@/components/centre-review-board";

/** Everything at the centre that needs a human decision, in one place. */
export default async function CentreReviewPage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const scope = centreUserScope(session.user);
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  const [trainees, lockedAttempts] = await Promise.all([
    prisma.user.findMany({
      where: { ...scope, active: true, role: { type: "TRAINEE" } },
      include: {
        role: { select: { type: true } },
        enrollments: { where: { completed: false }, select: { courseId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.quizAttempt.findMany({
      where: { locked: true, user: scope },
      select: {
        userId: true,
        quizId: true,
        user: { select: { name: true, email: true } },
        quiz: { select: { lesson: { select: { title: true, module: { select: { course: { select: { title: true } } } } } } } },
      },
    }),
  ]);

  // Per-field training status (batched) → who is ready to promote.
  const fieldStatusByUser = await getFieldStatusForUsers(trainees);
  const promote: PromoteCandidate[] = trainees
    .map((t) => {
      const fields = fieldStatusByUser.get(t.id) ?? [];
      const trained = fields.filter((f) => f.trained);
      if (trained.length === 0) return null;
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        trainedFields: trained.map((f) => f.name),
        otherFields: fields.filter((f) => !f.trained).map((f) => ({ name: f.name, done: f.done, total: f.total })),
      };
    })
    .filter(Boolean) as PromoteCandidate[];

  // Locked quiz attempts, one card per (user, quiz).
  const seenLocks = new Set<string>();
  const locked: LockedItem[] = [];
  for (const a of lockedAttempts) {
    const key = `${a.userId}:${a.quizId}`;
    if (seenLocks.has(key)) continue;
    seenLocks.add(key);
    locked.push({
      userId: a.userId,
      quizId: a.quizId,
      name: a.user.name,
      email: a.user.email,
      lessonTitle: a.quiz.lesson.title,
      courseTitle: a.quiz.lesson.module.course.title,
    });
  }

  const ghosts: GhostItem[] = trainees
    .filter((t) => !t.lastLoginAt && now - t.createdAt.getTime() > threeDays)
    .map((t) => ({ id: t.id, name: t.name, email: t.email, createdAt: t.createdAt.toISOString() }));

  const noPosition: NoPositionItem[] = trainees
    .filter((t) => effectiveSubPositions(t).length === 0)
    .map((t) => ({ id: t.id, name: t.name, email: t.email, createdAt: t.createdAt.toISOString() }));

  // Stalled: unfinished courses + no sign-in for 14 days. Include their average
  // progress so the card shows how far they got before going quiet.
  const stalledUsers = trainees.filter(
    (t) => t.enrollments.length > 0 && t.lastLoginAt && now - t.lastLoginAt.getTime() > fourteenDays
  );
  const stalledProgress = await getCourseProgressForUsers(
    stalledUsers.flatMap((t) => t.enrollments.map((e) => ({ userId: t.id, courseId: e.courseId })))
  );
  const stalled: StalledItem[] = stalledUsers.map((t) => {
    const percents = t.enrollments.map((e) => stalledProgress.get(`${t.id}:${e.courseId}`)?.percent ?? 0);
    return {
      id: t.id,
      name: t.name,
      email: t.email,
      lastLoginAt: (t.lastLoginAt as Date).toISOString(),
      unfinished: t.enrollments.length,
      avgPercent: percents.length ? Math.round(percents.reduce((n, p) => n + p, 0) / percents.length) : 0,
    };
  });

  const total = promote.length + locked.length + ghosts.length + noPosition.length + stalled.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Review"
        subtitle="Everything at your centre that needs a human decision — promotions, unlocks and follow-ups."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="To review" value={total} icon="🛎️" tone={total > 0 ? "orange" : "mint"} hint={total === 0 ? "All clear" : "Items below, most urgent first"} />
        <StatCard label="Ready to promote" value={promote.length} icon="🏅" tone="mint" />
        <StatCard label="Locked out" value={locked.length} icon="🔒" tone="gold" />
        <StatCard label="Need a nudge" value={ghosts.length + stalled.length} icon="📣" tone="picton" hint="Never signed in or gone quiet" />
      </div>
      <CentreReviewBoard promote={promote} locked={locked} ghosts={ghosts} noPosition={noPosition} stalled={stalled} />
    </div>
  );
}
