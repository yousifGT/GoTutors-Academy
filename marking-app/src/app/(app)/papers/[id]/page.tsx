import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { canReviewSubmission, submissionScope } from "@/lib/marking/access";
import { statusView, hasScore, canExport, confidenceLabel } from "@/lib/marking/view";
import { percentageOf, CONFIDENCE_FLOOR } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { PageHeader, Callout, StatCard } from "@/components/ui";
import { MarkReviewForm, type ReviewRow } from "@/components/mark-review-form";
import { RemarkButton } from "@/components/remark-button";
import { PrintButton } from "@/components/print-button";
import { StorePaper } from "@/components/store-paper";
import { paperOwnerLabel } from "@/lib/marking/paper-label";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The marked paper: the score, what went well, what to work on, and the working
 * behind every mark.
 *
 * The transcript sits next to each mark on purpose. Whoever hands this back has
 * to see *why* a mark was given without going back to the photo, and a misread
 * answer is the single most likely cause of a wrong mark.
 */
export default async function PaperPage({ params }: { params: { id: string } }) {
  const viewer = await requireViewer();

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    include: {
      student: { select: { id: true, name: true, yearGroup: true, admissionNumber: true } },
      markScheme: { include: { questions: { orderBy: { order: "asc" } } } },
      marks: { orderBy: { order: "asc" } },
      reviewedBy: { select: { name: true } },
      uploadedBy: { select: { name: true } },
    },
  });
  if (!submission) notFound();

  const view = statusView(submission.status);
  const pct = percentageOf(submission.awarded ?? 0, submission.available ?? 0);
  const band = bandFor(pct);
  const mayReview = canReviewSubmission(viewer, submission);

  const marksByLabel = new Map(submission.marks.map((m) => [m.label.trim().toLowerCase(), m]));
  const rows: ReviewRow[] = submission.markScheme.questions.map((q) => {
    const mark = marksByLabel.get(q.label.trim().toLowerCase());
    return {
      label: q.label,
      prompt: q.prompt,
      expectedAnswer: q.expectedAnswer,
      guidance: q.guidance,
      available: q.marks,
      awarded: mark?.awarded ?? 0,
      transcript: mark?.transcript ?? "",
      comment: mark?.comment ?? "",
      confidence: mark?.confidence ?? 0,
      legible: mark?.legible ?? false,
      // What the eye should land on first: anything the reader flagged, and
      // anything it never produced a mark for at all.
      flagged: !mark || !mark.legible || (mark.source === "AI" && mark.confidence < CONFIDENCE_FLOOR),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${paperOwnerLabel(submission)} — ${submission.markScheme.title}`}
        subtitle={[
          submission.student?.admissionNumber ? `Admission no. ${submission.student.admissionNumber}` : null,
          submission.markScheme.subject,
          submission.markScheme.level,
          `uploaded ${formatDate(submission.createdAt)} by ${submission.uploadedBy.name}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        backHref={submission.student ? `/students/${submission.student.id}` : "/unfiled"}
        backLabel={submission.student ? `${submission.student.name}'s papers` : "Papers not stored yet"}
        actions={
          <>
            <span className={`badge ${view.tone}`}>{view.label}</span>
            {canExport(submission.status) && (
              <a href={`/api/papers/${submission.id}/report`} className="btn-ghost text-sm">
                Export PDF
              </a>
            )}
            <PrintButton />
          </>
        }
      />

      {!submission.studentId && (
        <div className="card border-plum/40 no-print">
          <h3 className="font-bold">Store this result?</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            This paper was quick-marked, so it is not on any student&apos;s record yet. Store it against a child to keep
            it, or discard it.
          </p>
          <div className="mt-3">
            <StorePaper submissionId={submission.id} compact />
          </div>
        </div>
      )}

      {submission.failureReason && (
        <Callout>
          {submission.failureReason}
          {submission.status === "FAILED" && (
            <div className="mt-2 no-print">
              <RemarkButton submissionId={submission.id} />
            </div>
          )}
        </Callout>
      )}
      {submission.status === "PENDING" && (
        <Callout tone="sky">
          This paper has not been marked yet.
          <div className="mt-2 no-print">
            <RemarkButton submissionId={submission.id} label="Mark it now" />
          </div>
        </Callout>
      )}

      {hasScore(submission.status) && submission.available ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Score" value={`${submission.awarded}/${submission.available}`} icon="🎯" tone={band.tone} />
          <StatCard label="Percentage" value={`${pct}%`} icon="📈" tone={band.tone} hint={band.label} />
          <StatCard
            label={submission.status === "REVIEWED" ? "Checked by" : "Confidence"}
            value={
              submission.status === "REVIEWED"
                ? submission.reviewedBy?.name ?? "A person"
                : confidenceLabel(submission.confidence)
            }
            icon={submission.status === "REVIEWED" ? "🧑‍🏫" : "🔍"}
          />
        </div>
      ) : null}

      {(submission.overallComment || submission.strengths.length > 0 || submission.improvements.length > 0) && (
        <div className="card space-y-4">
          <h3 className="text-lg font-bold">How it went</h3>
          {submission.overallComment && <p className="text-sm">{submission.overallComment}</p>}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-teal">What went well</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {submission.strengths.length === 0 && <li className="text-[var(--muted)]">—</li>}
                {submission.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-teal">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-coral">What to work on</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {submission.improvements.length === 0 && <li className="text-[var(--muted)]">—</li>}
                {submission.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-coral">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {submission.marks.length > 0 && (
        <div className="card p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-bold">Question by question</div>
          <div className="divide-y divide-[var(--border)]">
            {submission.marks.map((m) => {
              const question = submission.markScheme.questions.find(
                (q) => q.label.trim().toLowerCase() === m.label.trim().toLowerCase()
              );
              const unsure = m.source === "AI" && (!m.legible || m.confidence < CONFIDENCE_FLOOR);
              return (
                <div key={m.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-sm font-bold">
                      Q{m.label}
                      {question && <span className="ml-2 font-normal text-[var(--muted)]">{question.prompt}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {m.source === "HUMAN" && <span className="badge bg-sky/15 text-sky">Marked by a person</span>}
                      {unsure && <span className="badge bg-amber/15 text-amber">Unsure</span>}
                      <span className="font-bold">
                        {m.awarded}/{m.available}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg bg-[var(--soft)] p-3 text-sm">
                    <span className="text-[var(--muted)]">They wrote: </span>
                    {m.transcript.trim() ? (
                      m.transcript
                    ) : (
                      <span className="italic text-[var(--muted)]">nothing readable</span>
                    )}
                  </div>
                  {m.comment && <div className="mt-2 text-sm">{m.comment}</div>}
                  {question && <div className="mt-1 text-xs text-[var(--muted)]">Expected: {question.expectedAnswer}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {submission.pageUrls.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold">The paper</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {submission.pageUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Page ${i + 1}`} className="w-full rounded-xl border border-[var(--border)]" />
                <div className="mt-1 text-center text-xs text-[var(--muted)]">Page {i + 1}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {submission.reviewNote && (
        <div className="card text-sm">
          <span className="text-[var(--muted)]">Staff note: </span>
          {submission.reviewNote}
        </div>
      )}

      {mayReview && submission.markScheme.questions.length > 0 && (
        <div className="no-print">
          <MarkReviewForm
            submissionId={submission.id}
            rows={rows}
            overallComment={submission.overallComment ?? ""}
            strengths={submission.strengths}
            improvements={submission.improvements}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-sm no-print">
        <Link href="/queue" className="text-sky hover:underline">
          ← Back to what needs marking
        </Link>
        {submission.studentId && (
          <Link href={`/students/${submission.studentId}`} className="text-sky hover:underline">
            {submission.student?.name}&apos;s other papers →
          </Link>
        )}
      </div>
    </div>
  );
}
