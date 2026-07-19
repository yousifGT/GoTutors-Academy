import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { PageHeader, StatCard } from "@/components/page-ui";

export default async function CentreDashboard() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const scope = centreUserScope(session.user);

  const [trainees, completed, locked, unread] = await Promise.all([
    prisma.user.count({ where: { ...scope, role: { type: "TRAINEE" } } }),
    prisma.enrollment.count({ where: { completed: true, user: scope } }),
    prisma.quizAttempt.count({ where: { locked: true, user: scope } }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "there";
  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Your centre at a glance." />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainees" value={trainees} icon="👥" tone="navy" />
        <StatCard label="Completed enrolments" value={completed} icon="✅" tone="mint" />
        <StatCard label="Quizzes locked" value={locked} icon="🔒" tone="orange" />
        <StatCard label="Unread notifications" value={unread} icon="🔔" tone="magenta" />
      </section>
    </div>
  );
}
