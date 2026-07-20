import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { getMissingPrerequisites } from "@/lib/course-prereqs";
import { ProgressBar } from "@/components/progress-bar";
import { PageHeader, EmptyState } from "@/components/page-ui";

export default async function MyCoursesPage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: session.user.id },
    include: { course: true },
    orderBy: { enrolledAt: "desc" },
  });
  const withProgress = await Promise.all(
    enrollments.map(async (e) => ({
      e,
      progress: await getCourseProgressForUser(session.user.id, e.courseId),
      missingPrereqs: await getMissingPrerequisites(session.user.id, e.courseId),
    }))
  );

  return (
    <div className="space-y-5">
      <PageHeader title="My courses" subtitle="Courses assigned to your position appear here automatically." />
      {withProgress.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No courses yet"
          hint="Courses are assigned automatically based on your position — check back soon or ask your centre admin."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {withProgress.map(({ e, progress, missingPrereqs }) => (
            <Link key={e.id} href={`/trainee/courses/${e.courseId}`} className={`gt-card p-5 hover:shadow-soft transition ${missingPrereqs.length > 0 ? "opacity-75" : ""}`}>
              {missingPrereqs.length > 0 ? (
                <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">🔒 Locked</span>
              ) : e.completed ? (
                <span className="gt-badge bg-mint/15 text-mint">🎓 Completed</span>
              ) : (
                <span className="gt-badge bg-picton/15 text-picton">{progress?.percent ?? 0}% complete</span>
              )}
              <div className="mt-1 text-lg font-bold">{e.course.title}</div>
              <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{e.course.description}</p>
              {missingPrereqs.length > 0 ? (
                <div className="mt-4 text-xs text-[var(--muted)]">
                  Complete <span className="text-[var(--fg)]">{missingPrereqs.map((m) => m.title).join(", ")}</span> first
                </div>
              ) : (
                <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
