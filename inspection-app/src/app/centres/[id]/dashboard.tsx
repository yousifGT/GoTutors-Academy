import Link from "next/link";
import type { CentreSize, CentreStatus } from "@prisma/client";
import type { CentreProgress, Finding } from "@/lib/progress";
import { SIZE_SHORT, niceDate, shortDate } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";
import { fmtDuration } from "@/lib/core";
import { ExportMenu } from "@/components/export-menu";
import { CentreHeads } from "./centre-heads";

/**
 * The four things that can have happened to a finding since the last visit.
 *
 * Each carries its own word and its own glyph, so the colour is decoration
 * rather than the encoding — "still not fixed" and "new this visit" are the two
 * a reader is most likely to confuse, and their reds and ambers are close
 * enough that hue alone would not separate them for everyone.
 */
const MOVES = [
  {
    key: "fixed" as const,
    glyph: "✓",
    title: "Put right",
    blurb: "Flagged last visit, acceptable this time.",
    tone: "text-emerald-800 bg-emerald-50 ring-emerald-200",
    dot: "bg-emerald-700",
  },
  {
    key: "stillWrong" as const,
    glyph: "!",
    title: "Still not fixed",
    blurb: "Flagged last visit and flagged again.",
    tone: "text-red-800 bg-red-50 ring-red-200",
    dot: "bg-red-700",
  },
  {
    key: "fresh" as const,
    glyph: "+",
    title: "New this visit",
    blurb: "Flagged for the first time.",
    tone: "text-amber-900 bg-amber-50 ring-amber-200",
    dot: "bg-amber-700",
  },
  {
    key: "unchecked" as const,
    glyph: "?",
    title: "Not checked again",
    blurb: "Flagged last visit, not answered this time.",
    tone: "text-slate-700 bg-slate-50 ring-slate-200",
    dot: "bg-slate-500",
  },
];

export function CentreDashboard({
  centre,
  progress,
  points,
  durations,
  people,
}: {
  centre: { id: string; name: string; address: string | null; size: CentreSize | null; status: CentreStatus };
  progress: CentreProgress;
  points: { id: string; date: Date; pct: number }[];
  durations: Record<string, number>;
  people: {
    managers: { id: string; name: string; email: string; role: string }[];
    candidates: { id: string; name: string; email: string; role: string }[];
    mayAssign: boolean;
  };
}) {
  const { latest, previous, movement, scoreChange, criticalNow, outstanding, visits } = progress;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <ExportMenu centreId={centre.id} label="Export this centre" />
          <Link href="/reports" className="text-sky-600">
            All inspections →
          </Link>
        </div>
      </div>

      <header className="mt-4">
        <h1 className="text-2xl font-bold text-navy">{centre.name}</h1>
        <p className="text-sm text-slate-500">
          {centre.size ? `${SIZE_SHORT[centre.size]} centre` : "No default size"}
          {centre.address && ` · ${centre.address}`}
          {centre.status === "CLOSED" && " · closed"}
          {` · ${visits.length} inspection${visits.length === 1 ? "" : "s"} on record`}
        </p>
      </header>

      {!latest ? (
        <>
          <p className="mt-8 rounded-xl bg-slate-50 p-6 text-sm text-slate-600 ring-1 ring-slate-200">
            This centre has not been inspected yet. Once a visit is submitted, this page shows how it went, what was
            asked to be put right, and — from the second visit onwards — what has been.
          </p>
          {/* Still shown: a centre with no visits yet is exactly when somebody
              is setting up who runs it. */}
          <CentreHeads
            centreId={centre.id}
            centreName={centre.name}
            managers={people.managers}
            candidates={people.candidates}
            mayAssign={people.mayAssign}
          />
        </>
      ) : (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Latest visit</p>
              <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: VERDICT_COLOR[latest.verdict ?? ""] ?? "#1C1960" }}>
                {latest.scorePct ?? "—"}
                {latest.scorePct != null && <span className="text-xl">%</span>}
              </p>
              <p className="text-sm font-medium" style={{ color: VERDICT_COLOR[latest.verdict ?? ""] ?? "#1C1960" }}>
                {latest.verdict ?? "no verdict"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {niceDate(latest.date)} · {latest.inspector}
              </p>
              <Link href={`/inspections/${latest.id}/report`} className="mt-2 inline-block text-xs font-medium text-sky-600">
                Read the full report →
              </Link>
            </div>

            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Since the last visit</p>
              {scoreChange === null ? (
                <p className="mt-2 text-sm text-slate-500">
                  {previous ? "One of the two visits has no recorded score." : "Nothing to compare against yet."}
                </p>
              ) : (
                <>
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums ${
                      scoreChange > 0 ? "text-emerald-700" : scoreChange < 0 ? "text-red-700" : "text-slate-500"
                    }`}
                  >
                    {scoreChange === 0 ? (
                      <span className="text-xl">No change</span>
                    ) : (
                      <>
                        {scoreChange > 0 ? "▲" : "▼"} {Math.abs(scoreChange)}
                        <span className="text-xl"> pts</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {previous && `against ${previous.scorePct}% on ${shortDate(previous.date)}`}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Still flagged</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-navy">{outstanding.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {criticalNow.length > 0 ? (
                  <span className="font-semibold text-red-700">
                    {criticalNow.length} critical
                  </span>
                ) : (
                  "none critical"
                )}
              </p>
            </div>
          </section>

          {criticalNow.length > 0 && (
            <section className="mt-4 rounded-xl bg-red-50 p-5 ring-1 ring-red-200">
              <h2 className="text-sm font-bold uppercase tracking-wide text-red-800">
                Critical — put right first ({criticalNow.length})
              </h2>
              <ul className="mt-2 space-y-1">
                {criticalNow.map((f) => (
                  <li key={f.question} className="text-sm text-red-900">
                    {f.question}
                    <Age finding={f} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Trend points={points} />

          {movement ? (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-navy">What moved since the last visit</h2>
              <p className="text-sm text-slate-500">
                {shortDate(previous!.date)} → {shortDate(latest.date)}. Matched on the wording of each question, so a
                question that has since been reworded starts again.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {MOVES.map((m) => (
                  <MoveCard key={m.key} move={m} findings={movement[m.key]} />
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-8 rounded-xl bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
              This is the first visit on record, so there is nothing to compare it with. The next one will show what
              has been put right and what has not.
            </p>
          )}

          {outstanding.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold text-navy">Everything still flagged</h2>
              <p className="text-sm text-slate-500">Longest-running first — a finding raised three visits running is a different thing from one raised once.</p>
              <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                {outstanding.map((f) => (
                  <li key={f.question} className="flex items-baseline gap-3 p-3 text-sm">
                    {f.critical && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">Critical</span>
                    )}
                    <span className="min-w-0 flex-1 text-slate-800">{f.question}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {f.visits} visit{f.visits === 1 ? "" : "s"} running
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CentreHeads
            centreId={centre.id}
            centreName={centre.name}
            managers={people.managers}
            candidates={people.candidates}
            mayAssign={people.mayAssign}
          />

          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">Every visit</h2>
            <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Inspector</th>
                    <th className="p-3 font-medium">Score</th>
                    <th className="p-3 font-medium">Verdict</th>
                    <th className="p-3 font-medium">Flagged</th>
                    <th className="p-3 font-medium">On site</th>
                    <th className="p-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <td className="p-3 whitespace-nowrap text-slate-700">{shortDate(v.date)}</td>
                      <td className="p-3 text-slate-600">{v.inspector}</td>
                      <td className="p-3 tabular-nums text-slate-800">{v.scorePct == null ? "—" : `${v.scorePct}%`}</td>
                      <td className="p-3 font-medium" style={{ color: VERDICT_COLOR[v.verdict ?? ""] ?? "#475569" }}>
                        {v.verdict ?? "—"}
                      </td>
                      <td className="p-3 tabular-nums text-slate-600">
                        {v.answers.filter((a) => a.bucket === "IMPROVE").length}
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-500">
                        {durations[v.id] ? fmtDuration(durations[v.id]) : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/inspections/${v.id}/report`} className="text-sky-600">
                          Report
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Age({ finding }: { finding: Finding }) {
  if (finding.visits < 2) return null;
  return <span className="ml-2 text-xs font-normal opacity-75">· flagged at the last {finding.visits} visits</span>;
}

function MoveCard({
  move,
  findings,
}: {
  move: (typeof MOVES)[number];
  findings: Finding[];
}) {
  return (
    <section className={`rounded-xl p-4 ring-1 ${move.tone}`}>
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${move.dot}`}
        >
          {move.glyph}
        </span>
        <h3 className="font-semibold">
          {move.title} ({findings.length})
        </h3>
      </div>
      <p className="mt-0.5 text-xs opacity-80">{move.blurb}</p>
      {findings.length === 0 ? (
        <p className="mt-2 text-sm opacity-60">None.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {findings.map((f) => (
            <li key={f.question}>
              {f.question}
              <Age finding={f} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The score at each visit.
 *
 * Plotted one step per visit rather than by date. The heading is "at each
 * visit", inspections are episodic and irregularly spaced, and two visits in
 * the same week — or on the same day — would otherwise land on top of each
 * other and read as one. The first and last dates carry the span.
 *
 * One series, so no legend: the heading names it. Only the end points carry a
 * number — a label on every point is noise at this size — and every point is a
 * link to that visit's report with a title giving the date and the score, so
 * the figure is navigable rather than decorative. The table below is the same
 * data for anyone who cannot use the picture.
 */
function Trend({ points }: { points: { id: string; date: Date; pct: number }[] }) {
  if (points.length < 2) return null;

  const W = 640;
  const H = 160;
  const PAD = { top: 26, right: 30, bottom: 28, left: 42 };
  const values = points.map((p) => p.pct);
  // A centre that scores the same every time still needs a line to look at, so
  // give a flat run a band to sit in the middle of rather than a zero-height
  // one that pins it to the top of the box.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(5, Math.round((max - min) * 0.25));
  const lo = Math.max(0, min - pad);
  const hi = Math.min(100, max + pad);
  const span = hi - lo || 1;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (pct: number) => PAD.top + (1 - (pct - lo) / span) * (H - PAD.top - PAD.bottom);

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const ticks = Array.from(new Set([lo, Math.round((lo + hi) / 2), hi]));

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-navy">Score at each visit</h2>
      <p className="text-sm text-slate-500">Oldest on the left. Each point opens that visit&apos;s report.</p>
      <div className="mt-3 overflow-x-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full min-w-[32rem]"
          role="img"
          aria-label={`Score at each visit, oldest first: ${points
            .map((p) => `${p.pct}% on ${shortDate(p.date)}`)
            .join(", ")}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">
                {t}%
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#0284c7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => {
            const edge = i === 0 || i === points.length - 1;
            // A label above a point near the ceiling would sit on the top
            // gridline and its number; put it underneath instead.
            const above = y(p.pct) - PAD.top > 16;
            return (
              <a key={p.id} href={`/inspections/${p.id}/report`}>
                <title>{`${shortDate(p.date)} — ${p.pct}%`}</title>
                {/* A hit target bigger than the mark, so a point is easy to hit. */}
                <circle cx={x(i)} cy={y(p.pct)} r={12} fill="transparent" />
                <circle cx={x(i)} cy={y(p.pct)} r={4.5} fill="#0284c7" stroke="#fff" strokeWidth={2} />
                {edge && (
                  <>
                    <text
                      x={x(i)}
                      y={above ? y(p.pct) - 10 : y(p.pct) + 17}
                      textAnchor={i === 0 ? "start" : "end"}
                      fontSize={11}
                      fontWeight={600}
                      fill="#334155"
                    >
                      {p.pct}%
                    </text>
                    <text x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "end"} fontSize={10} fill="#94a3b8">
                      {shortDate(p.date)}
                    </text>
                  </>
                )}
              </a>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
