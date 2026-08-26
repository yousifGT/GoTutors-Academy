"use client";

import type { ScoredInspection } from "@/lib/score";
import { VERDICT_COLOR } from "@/components/brand";
import type { Debrief } from "./runner";

interface Props {
  debrief: Debrief;
  targets: string;
  score: ScoredInspection;
  blockers: null | {
    unanswered: number;
    unansweredCritical: string[];
    missingNotes: string[];
    missingPhotos: string[];
  };
  answeredCount: number;
  totalQuestions: number;
  onDebrief: (patch: Partial<Debrief>) => void;
  onTargets: (t: string) => void;
  onSubmit: () => void;
  onJumpTo: (questionText: string) => void;
}

export function DebriefPanel(props: Props) {
  const { score } = props;
  // The same checks the server applies on submit, shown before the inspector
  // tries — so the refusal is never a surprise.
  const outstanding = {
    unanswered: props.totalQuestions - props.answeredCount,
    notes: score.missingNotes,
    photos: score.missingPhotos,
    criticals: score.unansweredCritical,
  };
  const ready =
    outstanding.unanswered === 0 && outstanding.notes.length === 0 && outstanding.photos.length === 0;

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result so far</p>
        <p className="mt-1 text-4xl font-bold" style={{ color: VERDICT_COLOR[score.verdict.word] ?? "#1C1960" }}>
          {score.pct}%
        </p>
        <p className="font-semibold" style={{ color: VERDICT_COLOR[score.verdict.word] ?? "#1C1960" }}>
          {score.verdict.word}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {score.well} done well · {score.poor} to improve · {score.obs} observations ·{" "}
          {props.answeredCount}/{props.totalQuestions} answered
        </p>
        {score.criticalFails.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm ring-1 ring-red-200">
            <p className="font-semibold text-red-800">
              Serious finding — this cannot be rated Good. Escalate immediately.
            </p>
            <ul className="mt-1 list-disc pl-5 text-red-800">
              {score.criticalFails.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="font-semibold text-navy">Debrief on site</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Who you spoke to" value={props.debrief.name} onChange={(v) => props.onDebrief({ name: v })} />
          <Field
            label="Their role"
            value={props.debrief.role}
            onChange={(v) => props.onDebrief({ role: v })}
            placeholder="Head of Centre"
          />
        </div>
        <Area
          label="Discussed and agreed"
          value={props.debrief.notes}
          onChange={(v) => props.onDebrief({ notes: v })}
        />
        <Area
          label="Their feedback"
          value={props.debrief.feedback}
          onChange={(v) => props.onDebrief({ feedback: v })}
        />
        <Area
          label="Targets before the next inspection"
          value={props.targets}
          onChange={props.onTargets}
        />
        <Field
          label="Email for the report"
          type="email"
          value={props.debrief.email}
          onChange={(v) => props.onDebrief({ email: v })}
          placeholder="owner@example.com"
        />
      </section>

      {!ready && (
        <section className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <h3 className="font-semibold text-amber-900">Before you can submit</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {outstanding.unanswered > 0 && (
              <li>
                {outstanding.unanswered} question{outstanding.unanswered === 1 ? "" : "s"} unanswered
                {outstanding.criticals.length > 0 && `, including ${outstanding.criticals.length} critical`}
              </li>
            )}
            {outstanding.notes.length > 0 && (
              <li>
                {outstanding.notes.length} answer{outstanding.notes.length === 1 ? " needs" : "s need"} a note:{" "}
                <JumpList items={outstanding.notes} onJump={props.onJumpTo} />
              </li>
            )}
            {outstanding.photos.length > 0 && (
              <li>
                {outstanding.photos.length} critical failure
                {outstanding.photos.length === 1 ? " needs" : "s need"} photo evidence:{" "}
                <JumpList items={outstanding.photos} onJump={props.onJumpTo} />
              </li>
            )}
          </ul>
        </section>
      )}

      {props.blockers && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          The server refused this submission — something is still outstanding above.
        </p>
      )}

      <button
        onClick={props.onSubmit}
        disabled={!ready}
        className="w-full rounded-lg bg-navy px-4 py-3.5 font-semibold text-white transition hover:bg-navy-700 disabled:opacity-40"
      >
        Submit inspection
      </button>
      <p className="pb-6 text-center text-xs text-slate-500">
        Once submitted this becomes a record and cannot be edited. Correcting it means another visit.
      </p>
    </div>
  );
}

function JumpList({ items, onJump }: { items: string[]; onJump: (t: string) => void }) {
  const shown = items.slice(0, 3);
  return (
    <>
      {shown.map((t, i) => (
        <span key={t}>
          <button onClick={() => onJump(t)} className="underline">
            {t}
          </button>
          {i < shown.length - 1 && ", "}
        </span>
      ))}
      {items.length > shown.length && ` and ${items.length - shown.length} more`}
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
    </label>
  );
}

function Area(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium text-slate-700">
      {props.label}
      <textarea
        value={props.value}
        rows={3}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
    </label>
  );
}
