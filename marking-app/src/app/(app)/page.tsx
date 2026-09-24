import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { schemeScope, studentScope, submissionScope } from "@/lib/marking/access";
import { markingIsConfigured } from "@/lib/marking/marker";
import { statusView, hasScore, WAITING_ON_HUMAN } from "@/lib/marking/view";
import { percentageOf } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { paperOwnerLabel } from "@/lib/marking/paper-label";
import { PageHeader, StatCard, Callout, Empty } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const viewer = await requireViewer();
  const scope = submissionScope(viewer);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [waiting, unstored, markedThisWeek, students, schemes, examples, recent] = await Promise.all([
    prisma.submission.count({ where: { ...scope, status: { in: WAITING_ON_HUMAN } } }),
    prisma.submission.count({ where: { ...scope, studentId: null } }),
    prisma.submission.count({ where: { ...scope, markedAt: { gte: weekAgo } } }),
    prisma.student.count({ where: { ...studentScope(viewer), active: true } }),
    prisma.markScheme.count({ where: { ...schemeScope(viewer), archived: false } }),
    prisma.markingExample.count({ where: { markScheme: { organisationId: viewer.organisationId } } }),
    prisma.submission.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        student: { select: { name: true, yearGroup: true } },
        markScheme: { select: { title: true, subject: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good to see you, ${viewer.name.split(" ")[0]}`}
        subtitle="Photograph a paper, get it marked, hand back feedback in the same lesson."
        actions={
          <>
            <Link href="/upload" className="btn-ghost">
              Mark for a student
            </Link>
            <Link href="/quick" className="btn-primary">
              Quick marking
            </Link>
          </>
        }
      />

      {!markingIsConfigured() && (
        <Callout>
          Automatic marking is off — no <code>ANTHROPIC_API_KEY</code> is set on this server. Papers you upload will go
          straight to the queue for marking by hand.
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Waiting on a person"
          value={waiting}
          icon="🖊️"
          tone={waiting > 0 ? "bg-amber/15 text-amber" : "bg-teal/15 text-teal"}
          hint={waiting > 0 ? "Papers that need marking by hand" : "Nothing outstanding"}
        />
        <StatCard
          label="Not stored yet"
          value={unstored}
          icon="📥"
          tone={unstored > 0 ? "bg-plum/15 text-plum" : "bg-teal/15 text-teal"}
          hint={unstored > 0 ? "Quick-marked papers with no student" : "Everything is filed"}
        />
        <StatCard label="Marked this week" value={markedThisWeek} icon="✅" tone="bg-teal/15 text-teal" />
        <StatCard
          label="Examples learned"
          value={examples}
          icon="🧠"
          tone="bg-sky/15 text-sky"
          hint="Marks a person checked, fed back into future marking"
        />
      </div>

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <span className="text-sm font-bold">Recent papers</span>
          <Link href="/queue" className="text-sm text-sky hover:underline">
            Needs marking →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--muted)]">
            Nothing marked yet.{" "}
            {schemes === 0 ? (
              <>
                Start by{" "}
                <Link href="/schemes/new" className="text-sky hover:underline">
                  writing a mark scheme
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/upload" className="text-sky hover:underline">
                  Upload a paper
                </Link>{" "}
                to get started.
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Paper</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => {
                  const view = statusView(s.status);
                  const pct = percentageOf(s.awarded ?? 0, s.available ?? 0);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/papers/${s.id}`} className="font-medium text-sky hover:underline">
                          {paperOwnerLabel(s)}
                        </Link>
                        {s.student?.yearGroup && (
                          <span className="ml-2 text-xs text-[var(--muted)]">{s.student.yearGroup}</span>
                        )}
                        {!s.studentId && <span className="badge ml-2 bg-plum/15 text-plum">Not stored</span>}
                      </td>
                      <td>
                        <div>{s.markScheme.title}</div>
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
                      <td className="whitespace-nowrap text-[var(--muted)]">{timeAgo(s.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {students === 0 && (
        <Empty title="No students yet">
          <Link href="/students" className="text-sky hover:underline">
            Add the children you tutor
          </Link>{" "}
          so their marked work builds up in one place.
        </Empty>
      )}
    </div>
  );
}
