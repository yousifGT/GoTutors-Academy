import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { inspectionScope } from "@/lib/access";
import { answerText, fmtDuration } from "@/lib/core";
import { scoreDbInspection, toCoreItem } from "@/lib/score";
import { SIZE_SHORT, niceDate } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";

export default async function ReportPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id: params.id }, inspectionScope({ id: user.id, role: user.role })] },
    include: {
      centre: { select: { name: true } },
      inspector: { select: { name: true } },
      template: {
        include: {
          sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
        },
      },
      answers: { include: { entries: { orderBy: { order: "asc" }, include: { photos: true } } } },
    },
  });
  if (!inspection) notFound();

  const sections = inspection.template.sections.map((s) => ({ title: s.title, questions: s.questions }));
  const answerRows = inspection.answers.map((a) => ({
    questionId: a.questionId,
    answer: a.answer,
    entries: a.entries,
  }));
  const score = scoreDbInspection(sections, answerRows, inspection.size);
  const byQuestion = new Map(answerRows.map((a) => [a.questionId, a]));

  // The report is organised by what it asks the reader to do, not by the order
  // the inspector walked the centre in.
  const groups = [
    { key: "IMPROVE", title: "To improve", tone: "text-red-800" },
    { key: "OBS", title: "Observations", tone: "text-sky-800" },
    { key: "WELL", title: "Done well", tone: "text-emerald-800" },
  ] as const;

  const rows = sections.flatMap((s) =>
    s.questions.map((q) => ({
      section: s.title,
      question: q,
      answer: byQuestion.get(q.id),
      scored: score.answers.find((a) => a.questionId === q.id),
    }))
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-sky-600">
        ← All inspections
      </Link>

      <header className="mt-4 rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <Wordmark className="text-lg" />
        <h1 className="mt-1 text-2xl font-bold text-navy">{inspection.centre.name}</h1>
        <p className="text-sm text-slate-500">
          {niceDate(inspection.date)} · {SIZE_SHORT[inspection.size]} centre · {inspection.inspector.name}
          {inspection.activeMs > 0 && ` · ${fmtDuration(inspection.activeMs)} on site`}
        </p>

        <div className="mt-4 flex items-end gap-4">
          <p className="text-5xl font-bold" style={{ color: VERDICT_COLOR[inspection.verdict ?? ""] ?? "#1C1960" }}>
            {inspection.scorePct}%
          </p>
          <p
            className="pb-1 text-lg font-semibold"
            style={{ color: VERDICT_COLOR[inspection.verdict ?? ""] ?? "#1C1960" }}
          >
            {inspection.verdict}
          </p>
          {inspection.status === "DRAFT" && (
            <span className="mb-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Draft
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {score.well} done well · {score.poor} to improve · {score.obs} observations
        </p>

        {score.criticalFails.length > 0 && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
            <p className="font-bold text-red-800">⚠ Serious finding — cannot be rated Good</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
              {score.criticalFails.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-medium text-red-800">Escalate these immediately.</p>
          </div>
        )}
      </header>

      {inspection.targets && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-navy">Targets before the next inspection</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{inspection.targets}</p>
        </section>
      )}

      {groups.map((g) => {
        const items = rows.filter((r) => r.scored?.bucket === g.key);
        if (!items.length) return null;
        return (
          <section key={g.key} className="mt-6">
            <h2 className={`text-sm font-bold uppercase tracking-wide ${g.tone}`}>
              {g.title} ({items.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {items.map((r) => {
                const item = toCoreItem(r.question, r.answer);
                return (
                  <li key={r.question.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{r.section}</p>
                    <p className="font-medium text-slate-800">{r.question.text}</p>
                    <p className="mt-1 text-sm">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {answerText(item)}
                      </span>
                      {r.question.critical && (
                        <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                          Critical
                        </span>
                      )}
                    </p>
                    {r.answer?.entries.map((e, i) => (
                      <div key={i} className="mt-2 border-l-2 border-slate-200 pl-3">
                        {e.who && <p className="text-xs font-semibold text-slate-600">{e.who}</p>}
                        {e.note && <p className="whitespace-pre-line text-sm text-slate-700">{e.note}</p>}
                        {e.photos.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {e.photos.map((p) => (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                key={p.id}
                                src={p.url}
                                alt="Evidence"
                                className="h-20 w-20 rounded object-cover ring-1 ring-slate-300"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {(inspection.debriefName || inspection.debriefNotes || inspection.debriefFeedback) && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-semibold text-navy">Debrief</h2>
          {inspection.debriefName && (
            <p className="mt-1 text-sm text-slate-600">
              Spoken to: {inspection.debriefName}
              {inspection.debriefRole && ` (${inspection.debriefRole})`}
            </p>
          )}
          {inspection.debriefNotes && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Discussed and agreed
              </p>
              <p className="whitespace-pre-line text-sm text-slate-700">{inspection.debriefNotes}</p>
            </>
          )}
          {inspection.debriefFeedback && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Their feedback</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{inspection.debriefFeedback}</p>
            </>
          )}
        </section>
      )}

      <p className="mt-8 pb-8 text-xs text-slate-400">
        Checklist v{inspection.template.version}. Emailing this report to the centre is not built yet — see the
        README.
      </p>
    </main>
  );
}
