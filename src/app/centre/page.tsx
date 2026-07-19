import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { timeAgo } from "@/lib/utils";
import { PageHeader, StatStrip, AttentionPanel, ActivityFeed, EmptyState, Avatar, type AttentionItem, type FeedItem } from "@/components/page-ui";

/** Action-first centre dashboard: who is stuck, who is idle, what just happened. */
export default async function CentreDashboard() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const scope = centreUserScope(session.user);

  const [trainees, completedCount, certCount, lockedUsers, enrolments, attempts, completions] = await Promise.all([
    prisma.user.findMany({
      where: { ...scope, role: { type: "TRAINEE" } },
      select: {
        id: true,
        name: true,
        isTrained: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        subPosition: true,
        subPositions: true,
        _count: { select: { enrollments: { where: { completed: false } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.enrollment.count({ where: { completed: true, user: scope } }),
    prisma.certificate.count({ where: { user: scope } }),
    prisma.quizAttempt.findMany({
      where: { locked: true, user: scope },
      select: { userId: true, user: { select: { name: true } } },
      distinct: ["userId"],
    }),
    prisma.enrollment.findMany({
      where: { user: scope },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
      orderBy: { enrolledAt: "desc" },
      take: 8,
    }),
    prisma.quizAttempt.findMany({
      where: { user: scope },
      include: { user: { select: { name: true } }, quiz: { select: { lesson: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.enrollment.findMany({
      where: { user: scope, completed: true, completedAt: { not: null } },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "there";
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  // ---- Needs attention (priority order) ----
  const attention: AttentionItem[] = [];
  if (lockedUsers.length > 0)
    attention.push({
      icon: "🔒",
      text: `${lockedUsers.length} trainee${lockedUsers.length === 1 ? " is" : "s are"} locked out of a quiz`,
      detail: `${lockedUsers.slice(0, 3).map((u) => u.user.name).join(", ")}${lockedUsers.length > 3 ? "…" : ""} — unlock retries from their profile.`,
      href: "/centre/trainees",
      action: "See who",
      tone: "orange",
    });
  const noPosition = trainees.filter((t) => t.active && effectiveSubPositions(t).length === 0);
  if (noPosition.length > 0)
    attention.push({
      icon: "🧩",
      text: `${noPosition.length} active trainee${noPosition.length === 1 ? " has" : "s have"} no sub-position`,
      detail: "They won't be auto-enrolled in any position-targeted course until one is set.",
      href: "/centre/trainees",
      action: "Assign positions",
      tone: "gold",
    });
  const neverLoggedIn = trainees.filter((t) => t.active && !t.lastLoginAt && now - t.createdAt.getTime() > threeDays);
  if (neverLoggedIn.length > 0)
    attention.push({
      icon: "👻",
      text: `${neverLoggedIn.length} trainee${neverLoggedIn.length === 1 ? " has" : "s have"} never signed in`,
      detail: "Created 3+ days ago — they may need their credentials re-sent.",
      href: "/centre/trainees",
      action: "Review",
      tone: "gold",
    });
  const stalled = trainees.filter(
    (t) => t.active && t._count.enrollments > 0 && t.lastLoginAt && now - t.lastLoginAt.getTime() > fourteenDays
  );
  if (stalled.length > 0)
    attention.push({
      icon: "🐌",
      text: `${stalled.length} trainee${stalled.length === 1 ? " is" : "s are"} stalled mid-training`,
      detail: "Unfinished courses and no sign-in for 14+ days.",
      href: "/centre/trainees",
      action: "Follow up",
      tone: "picton",
    });

  // ---- Activity feed ----
  const feed: FeedItem[] = [
    ...enrolments.map((e) => ({ at: e.enrolledAt, icon: "🧑‍🎓", text: `${e.user.name} enrolled in ${e.course.title}` })),
    ...attempts.map((a) => ({
      at: a.createdAt,
      icon: a.needsReview ? "📝" : a.passed ? "✅" : "❌",
      text: a.needsReview
        ? `${a.user.name} submitted answers for review — ${a.quiz.lesson.title}`
        : `${a.user.name} ${a.passed ? "passed" : "failed"} ${a.quiz.lesson.title} (${a.score}%)`,
    })),
    ...completions.map((c) => ({ at: c.completedAt as Date, icon: "🎓", text: `${c.user.name} completed ${c.course.title}` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what needs you at your centre today."
        actions={<Link href="/centre/trainees/new" className="gt-btn-primary">+ Add trainee</Link>}
      />

      <StatStrip
        items={[
          { label: "Trainees", value: trainees.length },
          { label: "Fully trained", value: trainees.filter((t) => t.isTrained).length },
          { label: "Completed enrolments", value: completedCount },
          { label: "Certificates", value: certCount },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-3">
          <h3 className="text-lg font-bold">Needs attention</h3>
          <AttentionPanel items={attention} emptyHint="Nobody locked out, nobody idle, every trainee has a position. Enjoy it." />

          <h3 className="pt-4 text-lg font-bold">Newest trainees</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {trainees.slice(0, 4).map((t) => (
              <Link key={t.id} href={`/centre/trainees/${t.id}`} className="gt-card p-4 transition hover:shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={t.name} size="sm" />
                    <div className="truncate font-semibold">{t.name}</div>
                  </div>
                  {t.isTrained ? (
                    <span className="gt-badge shrink-0 bg-mint/15 text-mint">Trained</span>
                  ) : (
                    <span className="gt-badge shrink-0 bg-[var(--soft)] text-[var(--muted)]">In training</span>
                  )}
                </div>
                <div className="mt-1.5 pl-[42px] text-xs text-[var(--muted)]">
                  {effectiveSubPositions(t).join(", ") || "No position yet"} · joined {timeAgo(t.createdAt)}
                </div>
              </Link>
            ))}
            {trainees.length === 0 && (
              <div className="sm:col-span-2">
                <EmptyState icon="🧑‍🎓" title="No trainees yet" hint="Add your first trainee to get started." action={<Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link>} />
              </div>
            )}
          </div>
          <div>
            <Link href="/centre/trainees" className="gt-btn-ghost text-xs">All trainees →</Link>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-bold">Recent activity</h3>
          <ActivityFeed items={feed} emptyHint="Enrolments, quiz results and completions at your centre show up here." />
        </section>
      </div>
    </div>
  );
}
