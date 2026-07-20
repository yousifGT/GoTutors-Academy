import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { PageHeader, EmptyState } from "@/components/page-ui";
import { InstructorProgressBoard, ProgressRow } from "@/components/instructor-progress-board";

export default async function InstructorProgressPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const where = session.user.roleType === "SUPER_ADMIN" ? {} : { course: { authorId: session.user.id } };
  const enrollments = await prisma.enrollment.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true, isTrained: true } }, course: { select: { id: true, title: true } } },
    orderBy: { enrolledAt: "desc" },
    take: 200,
  });
  const progressByKey = await getCourseProgressForUsers(
    enrollments.map((e) => ({ userId: e.userId, courseId: e.courseId }))
  );

  const rows: ProgressRow[] = enrollments.map((e) => {
    const p = progressByKey.get(`${e.userId}:${e.courseId}`);
    return {
      id: e.id,
      userId: e.user.id,
      traineeName: e.user.name,
      traineeEmail: e.user.email,
      isTrained: e.user.isTrained,
      courseId: e.course.id,
      courseTitle: e.course.title,
      percent: p?.percent ?? 0,
      done: p?.completed ?? 0,
      total: p?.total ?? 0,
      completed: e.completed,
      enrolledAt: e.enrolledAt.toISOString(),
    };
  });

  const courses = [...new Map(enrollments.map((e) => [e.course.id, e.course])).values()];

  return (
    <div className="space-y-5">
      <PageHeader title="Trainee progress" subtitle="The latest 200 enrolments across your courses — search, filter, spot who's stuck. Click a trainee for the full picture." />
      {rows.length === 0 ? (
        <EmptyState icon="📊" title="No enrolments yet" hint="Trainee progress appears here once people enrol in your courses." />
      ) : (
        <InstructorProgressBoard rows={rows} courses={courses} />
      )}
    </div>
  );
}
