import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { centreUserScope } from "@/lib/scope";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { PageHeader, EmptyState } from "@/components/page-ui";
import { TraineesDirectory, TraineeRow } from "@/components/trainees-directory";

export default async function CentreTraineesPage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");

  const trainees = await prisma.user.findMany({
    where: { ...centreUserScope(session.user), role: { type: "TRAINEE" } },
    include: {
      enrollments: { select: { courseId: true, completed: true } },
      quizAttempts: { where: { locked: true }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const progressByKey = await getCourseProgressForUsers(
    trainees.flatMap((t) => t.enrollments.map((e) => ({ userId: t.id, courseId: e.courseId })))
  );

  const rows: TraineeRow[] = trainees.map((t) => {
    const percents = t.enrollments.map((e) => progressByKey.get(`${t.id}:${e.courseId}`)?.percent ?? 0);
    return {
      id: t.id,
      name: t.name,
      email: t.email,
      subPositions: effectiveSubPositions(t),
      isTrained: t.isTrained,
      active: t.active,
      lastLoginAt: t.lastLoginAt?.toISOString() ?? null,
      enrolled: t.enrollments.length,
      completedCourses: t.enrollments.filter((e) => e.completed).length,
      avgPercent: percents.length ? Math.round(percents.reduce((n, p) => n + p, 0) / percents.length) : 0,
      lockedQuiz: t.quizAttempts.length > 0,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trainees"
        subtitle="Everyone training at your centre — click anyone for their full profile."
        actions={<Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="🧑‍🎓"
          title="No trainees yet"
          hint="Add your first trainee — they'll be auto-enrolled in matching courses."
          action={<Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link>}
        />
      ) : (
        <TraineesDirectory rows={rows} />
      )}
    </div>
  );
}
