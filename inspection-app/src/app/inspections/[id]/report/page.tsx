import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { inspectionScope } from "@/lib/access";
import { fmtDuration } from "@/lib/core";
import { buildReport, reportInclude } from "@/lib/report";
import { previouslyFlaggedAt } from "@/lib/previous";
import { SIZE_SHORT, niceDate } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";

const GROUP_TONE: Record<string, string> = {
  IMPROVE: "text-red-800",
  OBS: "text-sky-800",
  WELL: "text-emerald-800",
};

export default async function ReportPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();

  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id: params.id }, inspectionScope({ id: user.id, role: user.role })] },
    include: reportInclude,
  });
  if (!inspection) notFound();

  // Opening the report is what "read" means — not receiving it. Only ever the
  // viewer's own delivery, and only the first time, so the timestamp records
  // when they actually saw it.
  await prisma.reportDelivery.updateMany({
    where: { inspectionId: params.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  // The same assembly the PDF uses, so the two cannot disagree.
  const report = buildReport(inspection, await previouslyFlaggedAt(inspection.centreId, inspection.id, inspection.date));
  const colour = VERDICT_COLOR[report.verdict] ?? "#1C1960";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-sky-600">
          ← All inspections
        </Link>
        <div className="flex gap-3 text-sm">
          <a href={`/api/inspections/${params.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="text-sky-600">
            View PDF
          </a>
          <a href={`/api/inspections/${params.id}/pdf`} className="font-semibold text-navy">
            Download PDF
          </a>
        </div>
      </div>

      <header className="mt-4 rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <Wordmark className="text-lg" />
        <h1 className="mt-1 text-2xl font-bold text-navy">{report.centre}</h1>
        <p className="text-sm text-slate-500">
          {niceDate(report.date)} · {SIZE_SHORT[report.size]} centre · {report.inspector}
          {report.activeMs > 0 && ` · ${fmtDuration(report.activeMs)} on site`}
        </p>

        <div className="mt-4 flex items-end gap-4">
          <p className="text-5xl font-bold" style={{ color: colour }}>
            {report.pct}%
          </p>
          <p className="pb-1 text-lg font-semibold" style={{ color: colour }}>
            {report.verdict}
          </p>
          {report.status === "DRAFT" && (
            <span className="mb-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Draft
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {report.counts.well} done well · {report.counts.improve} to improve · {report.counts.obs} observations
          {report.counts.unanswered > 0 && ` · ${report.counts.unanswered} unanswered`}
        </p>

        {report.criticalFails.length > 0 && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
            <p className="font-bold text-red-800">⚠ Serious finding — cannot be rated Good</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
              {report.criticalFails.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-medium text-red-800">Escalate these immediately.</p>
          </div>
        )}
      </header>

      {report.repeats.length > 0 && (
        <section className="mt-6 rounded-xl bg-red-50 p-5 ring-1 ring-red-200">
          <h2 className="font-bold text-red-900">
            Not fixed since the last visit ({report.repeats.length})
          </h2>
          <p className="mt-1 text-sm text-red-800">
            These were raised at the previous inspection and are still failing.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {report.repeats.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.question}</span>
                <span className="text-red-700"> — {r.answer}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.targets && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-navy">Targets before the next inspection</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{report.targets}</p>
        </section>
      )}

      {report.groups.map((g) => (
        <section key={g.key} className="mt-6">
          <h2 className={`text-sm font-bold uppercase tracking-wide ${GROUP_TONE[g.key]}`}>
            {g.title} ({g.rows.length})
          </h2>
          <ul className="mt-2 space-y-2">
            {g.rows.map((r, i) => (
              <li key={`${g.key}-${i}`} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{r.section}</p>
                <p className="font-medium text-slate-800">{r.question}</p>
                <p className="mt-1 text-sm">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{r.answer}</span>
                  {r.critical && (
                    <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      Critical
                    </span>
                  )}
                  {r.repeat && (
                    <span className="ml-2 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      Repeat
                    </span>
                  )}
                </p>
                {r.entries.map((e, j) => (
                  <div key={j} className="mt-2 border-l-2 border-slate-200 pl-3">
                    {e.who && <p className="text-xs font-semibold text-slate-600">{e.who}</p>}
                    {e.note && <p className="whitespace-pre-line text-sm text-slate-700">{e.note}</p>}
                    {e.photos.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {e.photos.map((url) => (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            key={url}
                            src={url}
                            alt="Evidence"
                            className="h-20 w-20 rounded object-cover ring-1 ring-slate-300"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(report.debrief.name || report.debrief.notes || report.debrief.feedback) && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-navy">Debrief</h2>
          {report.debrief.name && (
            <p className="mt-1 text-sm text-slate-600">
              Spoken to: {report.debrief.name}
              {report.debrief.role && ` (${report.debrief.role})`}
            </p>
          )}
          {report.debrief.notes && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Discussed and agreed
              </p>
              <p className="whitespace-pre-line text-sm text-slate-700">{report.debrief.notes}</p>
            </>
          )}
          {report.debrief.feedback && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Their feedback</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{report.debrief.feedback}</p>
            </>
          )}
        </section>
      )}

      <p className="mt-8 pb-8 text-xs text-slate-400">
        Checklist v{report.checklistVersion}. Emailing this report to the centre is not built yet.
      </p>
    </main>
  );
}
