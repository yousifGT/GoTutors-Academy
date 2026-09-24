import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { statusView, hasScore, canExport } from "@/lib/marking/view";
import { percentageOf } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { paperOwnerLabel } from "@/lib/marking/paper-label";
import { PageHeader, Callout } from "@/components/ui";
import { StorePaper } from "@/components/store-paper";
import { RemarkButton } from "@/components/remark-button";

export const dynamic = "force-dynamic";

/**
 * The end of a quick-marking session: every paper, its score, and the question
 * the whole flow exists to defer — do you want to keep this?
 *
 * Nothing is stored until someone says so, and nothing is thrown away either.
 * An unanswered paper stays here, reachable from the dashboard, rather than
 * being auto-filed against a guess or quietly deleted.
 */
export default async function QuickResultsPage({ params }: { params: { batchId: string } }) {
  const viewer = await requireViewer();

  const submissions = await prisma.submission.findMany({
    where: { batchId: params.batchId, ...submissionScope(viewer) },
    orderBy: { createdAt: "asc" },
    include: {
      student: { select: { id: true, name: true, admissionNumber: true } },
      markScheme: { select: { title: true, subject: true } },
    },
  });
  if (submissions.length === 0) notFound();

  const unstored = submissions.filter((s) => !s.studentId).length;
  const exportable = submissions.filter((s) => canExport(s.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marked"
        subtitle={`${submissions.length} paper${submissions.length === 1 ? "" : "s"} against ${
          submissions[0].markScheme.title
        }`}
        backHref="/quick"
        backLabel="Quick marking"
        actions={
          exportable > 0 ? (
            <a href={`/api/batches/${params.batchId}/report`} className="btn-primary text-sm">
              Export all as PDF
            </a>
          ) : null
        }
      />

      {unstored > 0 && (
        <Callout>
          {unstored} of these {submissions.length === 1 ? "is" : "are"} not stored against a student yet. Store what you
          want to keep — anything you leave stays here and on your dashboard until you decide.
        </Callout>
      )}

      <div className="space-y-4">
        {submissions.map((s) => {
          const view = statusView(s.status);
          const pct = percentageOf(s.awarded ?? 0, s.available ?? 0);
          return (
            <div key={s.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/papers/${s.id}`} className="font-bold text-sky hover:underline">
                    {paperOwnerLabel(s)}
                  </Link>
                  {s.student && (
                    <span className="ml-2 font-mono text-xs text-[var(--muted)]">{s.student.admissionNumber}</span>
                  )}
                  <div className="text-sm text-[var(--muted)]">
                    {hasScore(s.status) && s.available ? (
                      <>
                        {s.awarded}/{s.available} <span className={`badge ${bandFor(pct).tone}`}>{pct}%</span>
                      </>
                    ) : (
                      "Not marked"
                    )}
                  </div>
                </div>
                <span className={`badge shrink-0 ${view.tone}`}>{view.label}</span>
              </div>

              {s.failureReason && <div className="text-sm text-[var(--muted)]">{s.failureReason}</div>}
              {s.status === "FAILED" && <RemarkButton submissionId={s.id} />}

              {s.studentId ? (
                <div className="text-sm text-teal">
                  Stored against{" "}
                  <Link href={`/students/${s.studentId}`} className="underline">
                    {s.student?.name}
                  </Link>
                  .
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--soft)] p-3">
                  <div className="mb-2 text-sm font-medium">Store this result?</div>
                  <StorePaper submissionId={s.id} compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
