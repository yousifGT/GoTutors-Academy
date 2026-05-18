import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";

export default async function MyCoursesPage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: session.user.id },
    include: { course: true },
    orderBy: { enrolledAt: "desc" },
  });
  const withProgress = await Promise.all(
    enrollments.map(async (e) => ({ e, progress: await getCourseProgressForUser(session.user.id, e.courseId) }))
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {withProgress.map(({ e, progress }) => (
        <Link key={e.id} href={`/trainee/courses/${e.courseId}`} className="gt-card p-5 hover:shadow-soft transition">
          <div className="text-sm text-picton font-semibold">{progress?.percent ?? 0}% complete</div>
          <div className="mt-1 text-lg font-bold">{e.course.title}</div>
          <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{e.course.description}</p>
          <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
        </Link>
      ))}
    </div>
  );
}
