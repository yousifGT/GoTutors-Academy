"use client";

import type { QuestionRow } from "@/lib/score";

/**
 * The running counters an inspector keeps through the whole session.
 *
 * Teacher stand-ups and student distractions happen while you are watching
 * something else, all session long. Asking for a total at the end means
 * remembering it; a counter that is always on screen means tapping it as it
 * happens. Both are ordinary number questions underneath — this is a second way
 * into the same two answers, not a separate thing to reconcile.
 */

export interface TallyTarget {
  question: QuestionRow;
  value: number;
}

const LABEL: Record<string, { short: string; hint: string }> = {
  standups: { short: "Stand-ups", hint: "teacher circulating — more is better" },
  distractions: { short: "Distractions", hint: "student off task — fewer is better" },
};

export function TallyBar({
  targets,
  onChange,
}: {
  targets: TallyTarget[];
  onChange: (questionId: string, value: number) => void;
}) {
  if (!targets.length) return null;

  return (
    <div className="flex gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      {targets.map(({ question, value }) => {
        const label = LABEL[question.tallyKey ?? ""] ?? { short: question.text, hint: "" };
        return (
          <div key={question.id} className="flex flex-1 items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-700">{label.short}</p>
              <p className="truncate text-[10px] text-slate-400">{label.hint}</p>
            </div>
            <button
              onClick={() => onChange(question.id, Math.max(0, value - 1))}
              aria-label={`One fewer ${label.short}`}
              className="h-8 w-8 shrink-0 rounded-full border border-slate-300 text-lg leading-none text-slate-600"
            >
              −
            </button>
            <span className="w-7 shrink-0 text-center text-lg font-bold tabular-nums text-navy">{value}</span>
            <button
              onClick={() => onChange(question.id, value + 1)}
              aria-label={`One more ${label.short}`}
              className="h-8 w-8 shrink-0 rounded-full bg-navy text-lg leading-none text-white"
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
