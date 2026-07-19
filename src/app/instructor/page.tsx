import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, StatStrip, AttentionPanel, ActivityFeed, type AttentionItem, type FeedItem } from "@/components/page-ui";
import { timeAgo } from "@/lib/utils";

/**
 * Action-first instructor dashboard: instead of duplicating the Courses list,
 * it answers "what needs me today?" — a prioritised attention panel, a live
 * activity feed and a compact recently-updated strip.
 */

export default async function InstructorDashboard() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const isSuper = session.user.roleType === "SUPER_ADMIN";
  const courseScope = isSuper ? {} : { authorId: session.user.id };
  const attemptScope = isSuper ? {} : { quiz: { lesson: { module: { course: { authorId: session.user.id } } } } };

  const [courses, pendingReview, lockedAttempts, enrolments, attempts, completions] = await Promise.all([
    prisma.course.findMany({
      where: courseScope,
      include: {
        _count: { select: { enrollments: true, modules: true } },
        roleAssignments: { select: { id: true } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.quizAttempt.count({ where: { needsReview: true, reviewedAt: null, ...attemptScope } }),
    prisma.quizAttempt.findMany({
      where: { locked: true, ...attemptScope },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.enrollment.findMany({
      where: { course: courseScope },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
      orderBy: { enrolledAt: "desc" },
      take: 8,
    }),
    prisma.quizAttempt.findMany({
      where: attemptScope,
      include: { user: { select: { name: true } }, quiz: { select: { lesson: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.enrollment.findMany({
      where: { course: courseScope, completed: true, completedAt: { not: null } },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
  ]);

  const totalEnrolments = courses.reduce((sum, c) => sum + c._count.enrollments, 0);
  const drafts = courses.filter((c) => !c.published);
  const published = courses.length - drafts.length;
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  // ---- Needs attention (priority order) ----
  const attention: AttentionItem[] = [];
  if (pendingReview > 0)
    attention.push({
      icon: "📝",
      text: `${pendingReview} answer${pendingReview === 1 ? "" : "s"} waiting for review`,
      detail: "Trainees can't retake or pass until these are graded.",
      href: "/instructor/review",
      action: "Open queue",
      tone: "orange",
    });
  if (lockedAttempts.length > 0)
    attention.push({
      icon: "🔒",
      text: `${lockedAttempts.length} trainee${lockedAttempts.length === 1 ? " is" : "s are"} locked out of a quiz`,
      detail: "They used all attempts — a centre admin can unlock retries.",
      href: "/instructor/progress",
      action: "See who",
      tone: "orange",
    });
  for (const c of courses.filter((c) => c.published && c.roleAssignments.length === 0)) {
    attention.push({
      icon: "📣",
      text: `“${c.title}” is published but has no audience`,
      detail: "Nobody can ever receive it — assign roles or sub-positions.",
      href: `/instructor/courses/${c.id}/details`,
      action: "Fix audience",
      tone: "gold",
    });
  }
  for (const c of courses.filter((c) => c.published && c.modules.every((m) => m._count.lessons === 0))) {
    attention.push({
      icon: "🕳️",
      text: `“${c.title}” is published with no lessons`,
      detail: "Trainees see an empty course they can never complete.",
      href: `/instructor/courses/${c.id}/curriculum`,
      action: "Add lessons",
      tone: "gold",
    });
  }
  const staleCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const staleDrafts = drafts.filter((c) => c.updatedAt.getTime() < staleCutoff);
  if (staleDrafts.length > 0)
    attention.push({
      icon: "🗃️",
      text: `${staleDrafts.length} draft${staleDrafts.length === 1 ? "" : "s"} untouched for 3+ days`,
      detail: `Oldest: “${staleDrafts[staleDrafts.length - 1].title}” — finish, publish or delete.`,
      href: "/instructor/courses",
      action: "Review drafts",
      tone: "picton",
    });

  // ---- Activity feed (merged, newest first) ----
  const feed: FeedItem[] = [
    ...enrolments.map((e) => ({
      at: e.enrolledAt,
      icon: "🧑‍🎓",
      text: `${e.user.name} enrolled in ${e.course.title}`,
    })),
    ...attempts.map((a) => ({
      at: a.createdAt,
      icon: a.needsReview ? "📝" : a.passed ? "✅" : "❌",
      text: a.needsReview
        ? `${a.user.name} submitted answers for review — ${a.quiz.lesson.title}`
        : `${a.user.name} ${a.passed ? "passed" : "failed"} ${a.quiz.lesson.title} (${a.score}%)`,
    })),
    ...completions.map((c) => ({
      at: c.completedAt as Date,
      icon: "🎓",
      text: `${c.user.name} completed ${c.course.title}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what needs you today."
        actions={<Link href="/instructor/courses/new" className="gt-btn-primary">+ New course</Link>}
      />

      <StatStrip
        items={[
          { label: "Courses", value: courses.length },
          { label: "Published", value: published },
          { label: "Drafts", value: drafts.length },
          { label: "Enrolments", value: totalEnrolments },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Needs attention */}
        <section className="lg:col-span-2 space-y-3">
          <h3 className="text-lg font-bold">Needs attention</h3>
          <AttentionPanel items={attention} emptyHint="No reviews waiting, no locked trainees, no broken courses. Enjoy it." />

          {/* Recently updated */}
          <h3 className="pt-4 text-lg font-bold">Recently updated</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/instructor/courses/${c.id}/curriculum`} className="gt-card p-4 transition hover:shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate font-semibold">{c.title}</div>
                  <span className={`gt-badge shrink-0 ${c.published ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                    {c.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {c._count.modules} module{c._count.modules === 1 ? "" : "s"} · {c._count.enrollments} enrolment{c._count.enrollments === 1 ? "" : "s"} · updated {timeAgo(c.updatedAt)}
                </div>
              </Link>
            ))}
          </div>
          <div>
            <Link href="/instructor/courses" className="text-sm text-picton">All courses →</Link>
          </div>
        </section>

        {/* Activity feed */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Recent activity</h3>
          <ActivityFeed items={feed} emptyHint="Enrolments, quiz results and completions show up here." />
        </section>
      </div>
    </div>
  );
}
