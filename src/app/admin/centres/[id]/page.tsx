import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { PageHeader, StatCard } from "@/components/page-ui";
import { CentreDetailBoard, CentreMember, CentreCourse } from "@/components/centre-detail-board";

export default async function CentreDetailPage({ params }: { params: { id: string } }) {
  await requireRole("SUPER_ADMIN");
  const centre = await prisma.centre.findUnique({ where: { id: params.id } });
  if (!centre) notFound();

  const [users, enrollments, attempts, certificates] = await Promise.all([
    prisma.user.findMany({
      where: { centreId: centre.id },
      include: { role: { select: { name: true, type: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { user: { centreId: centre.id } },
      select: { userId: true, courseId: true, completed: true, course: { select: { id: true, title: true } } },
    }),
    prisma.quizAttempt.findMany({ where: { user: { centreId: centre.id } }, select: { userId: true, passed: true } }),
    prisma.certificate.count({ where: { user: { centreId: centre.id } } }),
  ]);

  const progressByKey = await getCourseProgressForUsers(
    enrollments.map((e) => ({ userId: e.userId, courseId: e.courseId }))
  );
  const percentOf = (userId: string, courseId: string) => progressByKey.get(`${userId}:${courseId}`)?.percent ?? 0;

  // Headline stats
  const trainees = users.filter((u) => u.role.type === "TRAINEE");
  const passed = attempts.filter((a) => a.passed).length;
  const passRate = attempts.length ? Math.round((passed / attempts.length) * 100) : 0;
  const avgProgress = enrollments.length
    ? Math.round(enrollments.reduce((n, e) => n + percentOf(e.userId, e.courseId), 0) / enrollments.length)
    : 0;

  // Per-member rollup
  const enrolmentsByUser = new Map<string, { courseId: string; completed: boolean }[]>();
  for (const e of enrollments) {
    const arr = enrolmentsByUser.get(e.userId) ?? [];
    arr.push(e);
    enrolmentsByUser.set(e.userId, arr);
  }
  const members: CentreMember[] = users.map((u) => {
    const es = enrolmentsByUser.get(u.id) ?? [];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      roleName: u.role.name,
      roleType: u.role.type,
      subPositions: effectiveSubPositions(u),
      teacherPositions: u.teacherPositions,
      isTrained: u.isTrained,
      active: u.active,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      courses: es.length,
      completedCourses: es.filter((e) => e.completed).length,
      avgPercent: es.length ? Math.round(es.reduce((n, e) => n + percentOf(u.id, e.courseId), 0) / es.length) : 0,
    };
  });

  // Per-course rollup, carrying the enrollee roster for the drilldown popup.
  const userById = new Map(users.map((u) => [u.id, u]));
  const courseMap = new Map<string, CentreCourse & { percentSum: number }>();
  for (const e of enrollments) {
    const c = courseMap.get(e.courseId) ?? { id: e.course.id, title: e.course.title, enrolled: 0, completed: 0, avgPercent: 0, percentSum: 0, enrollees: [] };
    c.enrolled += 1;
    if (e.completed) c.completed += 1;
    c.percentSum += percentOf(e.userId, e.courseId);
    const u = userById.get(e.userId);
    if (u) {
      c.enrollees.push({
        userId: u.id,
        name: u.name,
        email: u.email,
        roleName: u.role.name,
        roleType: u.role.type,
        subPositions: effectiveSubPositions(u),
        percent: percentOf(e.userId, e.courseId),
        completed: e.completed,
      });
    }
    courseMap.set(e.courseId, c);
  }
  const courses: CentreCourse[] = [...courseMap.values()]
    .map(({ percentSum, ...c }) => ({ ...c, avgPercent: c.enrolled ? Math.round(percentSum / c.enrolled) : 0 }))
    .sort((a, b) => b.enrolled - a.enrolled);

  const trained = trainees.filter((t) => t.isTrained).length;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/admin/centres"
        backLabel="Centres"
        title={centre.name}
        subtitle={centre.location ? `📍 ${centre.location}` : "No location set"}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members" value={users.length} icon="👥" tone="navy" hint={`${trainees.length} trainee${trainees.length === 1 ? "" : "s"} · ${users.length - trainees.length} staff`} />
        <StatCard label="Fully trained" value={`${trained}/${trainees.length}`} icon="🏅" tone="gold" hint={`${certificates} certificate${certificates === 1 ? "" : "s"} earned`} />
        <StatCard label="Avg progress" value={`${avgProgress}%`} icon="📈" tone="picton" hint={`Across ${enrollments.length} enrolment${enrollments.length === 1 ? "" : "s"}`} />
        <StatCard label="Quiz pass rate" value={`${passRate}%`} icon="🎯" tone="mint" hint={`${passed} of ${attempts.length} attempts`} />
      </div>
      <CentreDetailBoard members={members} courses={courses} />
    </div>
  );
}
