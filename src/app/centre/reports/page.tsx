import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { PageHeader, StatCard } from "@/components/page-ui";

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

      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Course</th><th>Enrolments</th></tr></thead>
          <tbody>
            {byCourse.map((g) => (
              <tr key={g.courseId}><td>{titleMap.get(g.courseId) ?? g.courseId}</td><td>{g._count._all}</td></tr>
            ))}
            {byCourse.length === 0 && <tr><td colSpan={2} className="text-center py-6 text-[var(--muted)]">No enrolment data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
