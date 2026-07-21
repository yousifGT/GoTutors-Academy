import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { PageHeader, StatCard } from "@/components/page-ui";
import { CentreReportBoard, CourseReport, TraineeReport } from "@/components/centre-report-board";

export default async function CentreReportsPage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const userWhere = centreUserScope(session.user);

  const [trainees, enrollments, attempts] = await Promise.all([
    prisma.user.findMany({
      where: { ...userWhere, role: { type: "TRAINEE" } },
      select: { id: true, name: true, email: true, isTrained: true },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { user: userWhere },
      select: {
        userId: true,
        courseId: true,
        completed: true,
        course: { select: { id: true, title: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            subPosition: true,
            subPositions: true,
            role: { select: { name: true, type: true } },
          },
        },
      },
    }),
    prisma.quizAttempt.findMany({ where: { user: userWhere }, select: { userId: true, passed: true } }),
  ]);

  const progressByKey = await getCourseProgressForUsers(
    enrollments.map((e) => ({ userId: e.userId, courseId: e.courseId }))
  );
  const percentOf = (userId: string, courseId: string) => progressByKey.get(`${userId}:${courseId}`)?.percent ?? 0;

  // Headline stats
  const passed = attempts.filter((a) => a.passed).length;
  const failed = attempts.length - passed;
  const passRate = attempts.length ? Math.round((passed / attempts.length) * 100) : 0;
  const avgProgress = enrollments.length
    ? Math.round(enrollments.reduce((n, e) => n + percentOf(e.userId, e.courseId), 0) / enrollments.length)
    : 0;

  // Per-course rollup, carrying the full enrollee roster for the drilldown popup.
  const courseMap = new Map<string, CourseReport & { percentSum: number }>();
  for (const e of enrollments) {
    const c = courseMap.get(e.courseId) ?? { id: e.course.id, title: e.course.title, enrolled: 0, completed: 0, avgPercent: 0, percentSum: 0, enrollees: [] };
    c.enrolled += 1;
    if (e.completed) c.completed += 1;
    c.percentSum += percentOf(e.userId, e.courseId);
    c.enrollees.push({
      userId: e.user.id,
      name: e.user.name,
      email: e.user.email,
      roleName: e.user.role.name,
      roleType: e.user.role.type,
      subPositions: effectiveSubPositions(e.user),
      percent: percentOf(e.userId, e.courseId),
      completed: e.completed,
    });
    courseMap.set(e.courseId, c);
  }
  const courses: CourseReport[] = [...courseMap.values()]
    .map(({ percentSum, ...c }) => ({ ...c, avgPercent: c.enrolled ? Math.round(percentSum / c.enrolled) : 0 }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // Per-trainee rollup
  const attemptsByUser = new Map<string, { passes: number; fails: number }>();
  for (const a of attempts) {
    const t = attemptsByUser.get(a.userId) ?? { passes: 0, fails: 0 };
    if (a.passed) t.passes += 1; else t.fails += 1;
    attemptsByUser.set(a.userId, t);
  }
  const enrolmentsByUser = new Map<string, { userId: string; courseId: string; completed: boolean }[]>();
  for (const e of enrollments) {
    const arr = enrolmentsByUser.get(e.userId) ?? [];
    arr.push(e);
    enrolmentsByUser.set(e.userId, arr);
  }
  const traineeReports: TraineeReport[] = trainees.map((t) => {
    const es = enrolmentsByUser.get(t.id) ?? [];
    const quiz = attemptsByUser.get(t.id) ?? { passes: 0, fails: 0 };
    return {
      id: t.id,
      name: t.name,
      email: t.email,
      isTrained: t.isTrained,
      enrolled: es.length,
      completedCourses: es.filter((e) => e.completed).length,
      avgPercent: es.length ? Math.round(es.reduce((n, e) => n + percentOf(e.userId, e.courseId), 0) / es.length) : 0,
      passes: quiz.passes,
      fails: quiz.fails,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Quiz and enrolment performance for your centre."
        actions={<a href="/api/reports/centre/export" className="gt-btn-ghost">Download CSV</a>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainees" value={trainees.length} icon="👥" tone="navy" />
        <StatCard label="Avg progress" value={`${avgProgress}%`} icon="📈" tone="picton" hint="Across all enrolments" />
        <StatCard label="Pass rate" value={`${passRate}%`} icon="🎯" tone="mint" hint={`${passed} passed · ${failed} failed`} />
        <StatCard label="Quiz attempts" value={attempts.length} icon="📝" tone="gold" />
      </div>
      <CentreReportBoard courses={courses} trainees={traineeReports} />
    </div>
  );
}
