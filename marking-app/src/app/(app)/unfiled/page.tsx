import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { statusView, hasScore } from "@/lib/marking/view";
import { percentageOf } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { paperOwnerLabel } from "@/lib/marking/paper-label";
import { PageHeader, Empty } from "@/components/ui";
import { StorePaper } from "@/components/store-paper";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Everything quick marking left undecided.
 *
 * Quick marking's whole value is not stopping to file each paper, which means
 * the filing decision has to survive somewhere other than a results screen
 * somebody closed. This is that somewhere.
 */
export default async function UnfiledPage() {
  const viewer = await requireViewer();

  const papers = await prisma.submission.findMany({
    where: { ...submissionScope(viewer), studentId: null },
    orderBy: { createdAt: "desc" },
    include: { markScheme: { select: { title: true, subject: true } }, uploadedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Not stored yet"
        subtitle="Papers marked without a student. Store the ones worth keeping."
        backHref="/"
        backLabel="Dashboard"
      />

      {papers.length === 0 ? (
        <Empty title="Nothing waiting to be filed">
          Papers you mark with{" "}
          <Link href="/quick" className="text-sky hover:underline">
            quick marking
          </Link>{" "}
          appear here until you store or discard them.
        </Empty>
      ) : (
        <div className="space-y-4">
          {papers.map((s) => {
            const view = statusView(s.status);
            const pct = percentageOf(s.awarded ?? 0, s.available ?? 0);
            return (
              <div key={s.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/papers/${s.id}`} className="font-bold text-sky hover:underline">
                      {paperOwnerLabel(s)}
                    </Link>
                    <div className="text-sm text-[var(--muted)]">
                      {s.markScheme.title} · {s.markScheme.subject} · marked {timeAgo(s.createdAt)} by{" "}
                      {s.uploadedBy.name}
                    </div>
                    {hasScore(s.status) && s.available ? (
                      <div className="mt-1 text-sm">
                        {s.awarded}/{s.available} <span className={`badge ${bandFor(pct).tone}`}>{pct}%</span>
                      </div>
                    ) : null}
                  </div>
                  <span className={`badge shrink-0 ${view.tone}`}>{view.label}</span>
                </div>
                <div className="rounded-xl bg-[var(--soft)] p-3">
                  <StorePaper submissionId={s.id} compact />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
