import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";
import { statusView, hasScore, trend } from "@/lib/marking/view";
import { percentageOf } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { PageHeader, StatCard, Empty } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One child's marked work, oldest to newest.
 *
 * The trend is only shown once there are two marked papers to compare. A single
 * result dressed up as a direction of travel is a lie a parent will repeat.
 */
export default async function StudentPage({ params }: { params: { id: string } }) {
  const viewer = await requireViewer();

  const student = await prisma.student.findFirst({
    where: { id: params.id, ...studentScope(viewer) },
    include: {
      tutor: { select: { name: true } },
      submissions: {
        orderBy: { createdAt: "desc" },
        include: { markScheme: { select: { title: true, subject: true } } },
      },
    },
  });
  if (!student) notFound();

  const scored = student.submissions
    .filter((s) => hasScore(s.status) && (s.available ?? 0) > 0)
    .map((s) => ({ ...s, percentage: percentageOf(s.awarded ?? 0, s.available ?? 0) }));
  // Oldest first, so "change" reads as a journey rather than an arithmetic slip.
  const chronological = [...scored].reverse();
  const movement = trend(chronological.map((s) => s.percentage));
  const average =
    scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.percentage, 0) / scored.length) : null;

  // The topics that keep costing marks, across everything marked so far.
  const weakest = await prisma.submissionMark.groupBy({
    by: ["label"],
    where: { submission: { studentId: student.id }, available: { gt: 0 } },
    _sum: { awarded: true, available: true },
    _count: { _all: true },
    having: { available: { _sum: { gt: 0 } } },
  });
  const struggles = weakest
    .map((row) => ({
      label: row.label,
      attempts: row._count._all,
      percentage: percentageOf(row._sum.awarded ?? 0, row._sum.available ?? 0),
    }))
    .filter((row) => row.attempts > 1 && row.percentage < 60)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.name}
        subtitle={`${student.yearGroup ? `${student.yearGroup} · ` : ""}tutored by ${student.tutor.name}`}
        backHref="/students"
        backLabel="Students"
        actions={
          <Link href="/upload" className="btn-primary text-sm">
            Mark a paper
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Papers marked" value={scored.length} icon="📄" />
        <StatCard
          label="Average"
          value={average === null ? "—" : `${average}%`}
          icon="📊"
          tone={average === null ? undefined : bandFor(average).tone}
          hint={average === null ? "Nothing marked yet" : bandFor(average).label}
        />
        <StatCard
          label="Trend"
          value={
            movement === null
              ? "—"
              : `${movement.change > 0 ? "+" : ""}${movement.change} pts`
          }
          icon={movement?.direction === "up" ? "📈" : movement?.direction === "down" ? "📉" : "➡️"}
          tone={
            movement?.direction === "up"
              ? "bg-teal/15 text-teal"
              : movement?.direction === "down"
                ? "bg-coral/15 text-coral"
                : undefined
          }
          hint={movement === null ? "Two marked papers needed" : "First marked paper to latest"}
        />
      </div>

      {struggles.length > 0 && (
        <div className="card">
          <h3 className="font-bold">Questions that keep costing marks</h3>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Attempted more than once, and under 60% across all attempts.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {struggles.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--soft)] px-3 py-2">
                <span>Q{row.label}</span>
                <span className="text-[var(--muted)]">
                  {row.percentage}% across {row.attempts} attempts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {student.submissions.length === 0 ? (
        <Empty title="No papers yet">
          <Link href="/upload" className="text-sky hover:underline">
            Photograph one
          </Link>{" "}
          to start building a record.
        </Empty>
      ) : (
        <div className="card p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-bold">Every paper</div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {student.submissions.map((s) => {
                  const view = statusView(s.status);
                  const pct = percentageOf(s.awarded ?? 0, s.available ?? 0);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/papers/${s.id}`} className="font-medium text-sky hover:underline">
                          {s.markScheme.title}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">{s.markScheme.subject}</div>
                      </td>
                      <td>
                        {hasScore(s.status) && s.available ? (
                          <span className="whitespace-nowrap">
                            {s.awarded}/{s.available} <span className={`badge ${bandFor(pct).tone}`}>{pct}%</span>
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${view.tone}`}>{view.label}</span>
                      </td>
                      <td className="whitespace-nowrap text-[var(--muted)]">{formatDate(s.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
