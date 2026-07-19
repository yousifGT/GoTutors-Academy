import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { ProgressBar } from "@/components/progress-bar";
import { timeAgo } from "@/lib/utils";
import { PageHeader, EmptyState, RoleChip } from "@/components/page-ui";

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
      <PageHeader title="My team" subtitle="Progress and certificates for everyone you supervise." />
      {rows.length === 0 && <EmptyState icon="🤝" title="No reports yet" hint="Trainees appear here once you are set as their supervisor." />}
      {rows.map(({ user, progress }) => (
        <div key={user.id} className="gt-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-picton to-cyan font-bold text-navy">{user.name.slice(0, 1).toUpperCase()}</div>
              <div>
              <div className="font-bold">{user.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>{user.email}</span>
                <RoleChip type={user.role.type} label={user.role.name} />
                <span>{user.centre?.name ?? "no centre"}</span>
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Last login: {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</div>
              </div>
            </div>
          </div>
          {progress.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted)]">📚 No enrolments yet.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {progress.map(({ enrollment, progress: p }) => (
                <div key={enrollment.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{enrollment.course.title}</div>
                    <ProgressBar percent={p?.percent ?? 0} />
                  </div>
                  <div className="text-xs w-12 text-right">{p?.percent ?? 0}%</div>
                  <div>{enrollment.completed ? <span className="gt-badge bg-mint/15 text-mint">Completed</span> : <span className="gt-badge bg-gold/15 text-gold">In progress</span>}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-right">
            <Link href={`/my-team/certificates?user=${user.id}`} className="gt-btn-ghost text-xs">View certificates</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
