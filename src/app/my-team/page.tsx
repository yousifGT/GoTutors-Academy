import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";
import { formatDate } from "@/lib/utils";

export default async function MyTeamPage() {
  const session = await requireSession();
  const reports = await prisma.user.findMany({
    where: { supervisorId: session.user.id },
    include: {
      role: true,
      centre: true,
      enrollments: { include: { course: true } },
    },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(reports.map(async (r) => {
    const enrolments = r.enrollments;
    const progress = await Promise.all(
      enrolments.map(async (e) => ({ enrollment: e, progress: await getCourseProgressForUser(r.id, e.courseId) }))
    );
    return { user: r, progress };
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">My team</h2>
      {rows.length === 0 && <div className="gt-card p-6 text-[var(--muted)]">No reports yet.</div>}
      {rows.map(({ user, progress }) => (
        <div key={user.id} className="gt-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-bold">{user.name}</div>
              <div className="text-xs text-[var(--muted)]">{user.email} · {user.role.name} · {user.centre?.name ?? "no centre"}</div>
              <div className="text-xs text-[var(--muted)]">Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</div>
            </div>
          </div>
          {progress.length === 0 ? (
            <div className="text-sm text-[var(--muted)] mt-3">No enrolments.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {progress.map(({ enrollment, progress: p }) => (
                <div key={enrollment.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{enrollment.course.title}</div>
                    <ProgressBar percent={p?.percent ?? 0} />
                  </div>
                  <div className="text-xs w-12 text-right">{p?.percent ?? 0}%</div>
                  <div>{enrollment.completed ? <span className="gt-badge bg-mint/20 text-mint">Completed</span> : <span className="gt-badge bg-gold/20 text-gold">In progress</span>}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-right">
            <Link href={`/my-team/certificates?user=${user.id}`} className="text-sm text-picton">View certificates</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
