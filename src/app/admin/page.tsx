import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, StatCard } from "@/components/page-ui";

export default async function AdminDashboard() {
  const session = await requireRole("SUPER_ADMIN");
  const [centres, users, courses, certs, locked, pendingReview] = await Promise.all([
    prisma.centre.count(),
    prisma.user.count(),
    prisma.course.count(),
    prisma.certificate.count(),
    prisma.quizAttempt.count({ where: { locked: true } }),
    prisma.quizAttempt.count({ where: { needsReview: true, reviewedAt: null } }),
  ]);
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Everything across the academy at a glance." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Centres" value={centres} icon="🏫" tone="navy" />
        <StatCard label="Users" value={users} icon="👥" tone="picton" />
        <StatCard label="Courses" value={courses} icon="📚" tone="magenta" />
        <StatCard label="Certificates issued" value={certs} icon="🎓" tone="mint" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="gt-card flex items-center justify-between p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Needs attention</div>
            <div className="mt-1 font-semibold">{pendingReview} answer{pendingReview === 1 ? "" : "s"} awaiting review</div>
          </div>
          <Link href="/instructor/review" className="gt-btn-ghost text-sm">Open queue</Link>
        </div>
        <div className="gt-card flex items-center justify-between p-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Locked quizzes</div>
            <div className="mt-1 font-semibold">{locked} trainee attempt{locked === 1 ? "" : "s"} locked</div>
          </div>
          <Link href="/admin/users" className="gt-btn-ghost text-sm">Manage users</Link>
        </div>
      </section>
    </div>
  );
}
