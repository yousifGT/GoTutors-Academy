import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { PageHeader, StatCard, EmptyState } from "@/components/page-ui";

export default async function CentreReportsPage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const userWhere = centreUserScope(session.user);

  const [trainees, allAttempts, byCourse] = await Promise.all([
    prisma.user.findMany({ where: { ...userWhere, role: { type: "TRAINEE" } }, select: { id: true } }),
    prisma.quizAttempt.findMany({
      where: { user: userWhere },
      select: { passed: true, score: true },
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { user: userWhere },
      _count: { _all: true },
    }),
  ]);

  const passed = allAttempts.filter((a) => a.passed).length;
  const failed = allAttempts.length - passed;
  const passRate = allAttempts.length ? Math.round((passed / allAttempts.length) * 100) : 0;

  const courses = await prisma.course.findMany({
    where: { id: { in: byCourse.map((g) => g.courseId) } },
    select: { id: true, title: true },
  });
  const titleMap = new Map(courses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        subtitle="Quiz and enrolment performance for your centre."
        actions={<a href="/api/reports/centre/export" className="gt-btn-ghost">Download CSV</a>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainees" value={trainees.length} icon="👥" tone="navy" />
        <StatCard label="Pass rate" value={`${passRate}%`} icon="🎯" tone="mint" />
        <StatCard label="Total passes" value={passed} icon="✅" tone="picton" />
        <StatCard label="Total fails" value={failed} icon="❌" tone="orange" />
      </div>

      {byCourse.length === 0 ? (
        <EmptyState icon="📊" title="No enrolment data" hint="Numbers appear here once trainees are enrolled in courses." />
      ) : (
        <div className="gt-card p-5">
          <h3 className="font-bold">Enrolments by course</h3>
          <div className="mt-4 space-y-3">
            {(() => {
              const sorted = [...byCourse].sort((a, b) => b._count._all - a._count._all);
              const max = sorted[0]?._count._all ?? 1;
              return sorted.map((g) => (
                <div key={g.courseId}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{titleMap.get(g.courseId) ?? g.courseId}</span>
                    <span className="shrink-0 font-bold">{g._count._all}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--soft)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-picton to-cyan"
                      style={{ width: `${Math.max(6, Math.round((g._count._all / max) * 100))}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
