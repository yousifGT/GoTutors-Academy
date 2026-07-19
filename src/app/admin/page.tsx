import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader, StatStrip, AttentionPanel, ActivityFeed, type AttentionItem, type FeedItem } from "@/components/page-ui";

/** Action-first super-admin dashboard: platform-wide blockers, broken courses and live activity. */
export default async function AdminDashboard() {
  const session = await requireRole("SUPER_ADMIN");

  const [centres, userCount, courses, certCount, pendingReview, lockedUsers, emptyCentres, enrolments, attempts, completions, auditEntries] =
    await Promise.all([
      prisma.centre.count(),
      prisma.user.count(),
      prisma.course.findMany({
        where: { published: true },
        include: {
          roleAssignments: { select: { id: true } },
          modules: { select: { _count: { select: { lessons: true } } } },
        },
      }),
      prisma.certificate.count(),
      prisma.quizAttempt.count({ where: { needsReview: true, reviewedAt: null } }),
      prisma.quizAttempt.findMany({ where: { locked: true }, select: { userId: true }, distinct: ["userId"] }),
      prisma.centre.findMany({ where: { users: { none: {} } }, select: { name: true } }),
      prisma.enrollment.findMany({
        include: { user: { select: { name: true } }, course: { select: { title: true } } },
        orderBy: { enrolledAt: "desc" },
        take: 8,
      }),
      prisma.quizAttempt.findMany({
        include: { user: { select: { name: true } }, quiz: { select: { lesson: { select: { title: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.enrollment.findMany({
        where: { completed: true, completedAt: { not: null } },
        include: { user: { select: { name: true } }, course: { select: { title: true } } },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const courseCount = await prisma.course.count();
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
  if (lockedUsers.length > 0)
    attention.push({
      icon: "🔒",
      text: `${lockedUsers.length} trainee${lockedUsers.length === 1 ? " is" : "s are"} locked out of a quiz`,
      detail: "They used all attempts — unlock retries from their trainee profile.",
      href: "/admin/users",
      action: "See users",
      tone: "orange",
    });
  for (const c of courses.filter((c) => c.roleAssignments.length === 0)) {
    attention.push({
      icon: "📣",
      text: `“${c.title}” is published but has no audience`,
      detail: "Nobody can ever receive it — assign roles or sub-positions.",
      href: `/instructor/courses/${c.id}/details`,
      action: "Fix audience",
      tone: "gold",
    });
  }
  for (const c of courses.filter((c) => c.modules.every((m) => m._count.lessons === 0))) {
    attention.push({
      icon: "🕳️",
      text: `“${c.title}” is published with no lessons`,
      detail: "Trainees see an empty course they can never complete.",
      href: `/instructor/courses/${c.id}/curriculum`,
      action: "Add lessons",
      tone: "gold",
    });
  }
  if (emptyCentres.length > 0)
    attention.push({
      icon: "🏚️",
      text: `${emptyCentres.length} centre${emptyCentres.length === 1 ? " has" : "s have"} no users`,
      detail: `${emptyCentres.slice(0, 3).map((c) => c.name).join(", ")}${emptyCentres.length > 3 ? "…" : ""}`,
      href: "/admin/centres",
      action: "Review centres",
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
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Everything across the academy that needs you today." />

      <StatStrip
        items={[
          { label: "Centres", value: centres },
          { label: "Users", value: userCount },
          { label: "Courses", value: courseCount },
          { label: "Certificates", value: certCount },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-3">
          <h3 className="text-lg font-bold">Needs attention</h3>
          <AttentionPanel items={attention} emptyHint="No reviews waiting, no locked trainees, no broken courses, no empty centres." />

          <h3 className="pt-4 text-lg font-bold">Latest audit entries</h3>
          <div className="gt-card divide-y divide-[var(--border)] p-0">
            {auditEntries.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="gt-badge bg-lavender text-magenta shrink-0">{l.action}</span>
                <span className="min-w-0 flex-1 truncate">{l.target ?? "—"}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">{formatDate(l.createdAt)}</span>
              </div>
            ))}
            {auditEntries.length === 0 && <div className="px-4 py-3 text-sm text-[var(--muted)]">No audit entries yet.</div>}
          </div>
          <div>
            <Link href="/admin/audit" className="text-sm text-picton">Full audit log →</Link>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-bold">Recent activity</h3>
          <ActivityFeed items={feed} emptyHint="Enrolments, quiz results and completions across all centres show up here." />
        </section>
      </div>
    </div>
  );
}
