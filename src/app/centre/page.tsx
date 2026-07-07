import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";

export default async function CentreDashboard() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const scope = centreUserScope(session.user);

  const [trainees, completed, locked, unread] = await Promise.all([
    prisma.user.count({ where: { ...scope, role: { type: "TRAINEE" } } }),
    prisma.enrollment.count({ where: { completed: true, user: scope } }),
    prisma.quizAttempt.count({ where: { locked: true, user: scope } }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Trainees</div><div className="mt-2 text-3xl font-bold text-navy dark:text-ice">{trainees}</div></div>
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Completed enrolments</div><div className="mt-2 text-3xl font-bold text-mint">{completed}</div></div>
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Quizzes locked</div><div className="mt-2 text-3xl font-bold text-orange">{locked}</div></div>
        <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Unread notifications</div><div className="mt-2 text-3xl font-bold text-magenta">{unread}</div></div>
      </section>
    </div>
  );
}
