"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CentreSize } from "@prisma/client";
import { fmtDuration, optionsFor, resolveGuide } from "@/lib/core";
import { useActiveClock } from "@/lib/use-active-clock";
import { scoreDbInspection, toCoreItem, toCoreSize, type QuestionRow } from "@/lib/score";
import { SIZE_SHORT } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";
import { QuestionCard } from "./question-card";
import { DebriefPanel } from "./debrief";

export interface Entry {
  note: string;
  who: string;
  photos: string[];
}
export interface AnswerState {
  questionId: string;
  answer: string | null;
  entries: Entry[];
}
export interface Debrief {
  role: string;
  name: string;
  notes: string;
  feedback: string;
  email: string;
}

interface Props {
  id: string;
  centreName: string;
  size: CentreSize;
  date: string;
  activeMs: number;
  sections: { title: string; questions: QuestionRow[] }[];
  saved: AnswerState[];
  debrief: Debrief;
  targets: string;
}

const emptyEntry = (): Entry => ({ note: "", who: "", photos: [] });

/**
 * Always hand the card at least one entry to edit.
 *
 * Autosave drops entries that hold nothing, so a saved answer comes back with
 * an empty list. Without this, a question answered in a way that demands a note
 * would reload with the demand shown and no box to write it in — and the
 * inspection could never be submitted.
 */
const withEntry = (a: AnswerState): AnswerState =>
  a.entries.length ? a : { ...a, entries: [emptyEntry()] };

export function Runner(props: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Map<string, AnswerState>>(
    () => new Map(props.saved.map((a) => [a.questionId, withEntry(a)]))
  );
  const [debrief, setDebrief] = useState(props.debrief);
  const [targets, setTargets] = useState(props.targets);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [onDebrief, setOnDebrief] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [blockers, setBlockers] = useState<null | {
    unanswered: number;
    unansweredCritical: string[];
    missingNotes: string[];
    missingPhotos: string[];
  }>(null);

  // The clock is the source of truth for duration; it pauses when the inspector
  // leaves the tab, so we send its value rather than a wall-clock difference.
  const clockRef = useRef<{ total: () => number } | null>(null);

  /* ---------- scoring, in the browser, with the same rules as the server ---------- */
  const score = useMemo(
    () =>
      scoreDbInspection(
        props.sections,
        Array.from(answers.values()).map((a) => ({
          questionId: a.questionId,
          answer: a.answer,
          entries: a.entries.map((e) => ({
            note: e.note,
            who: e.who,
            photos: e.photos.map((url) => ({ url })),
          })),
        })),
        props.size
      ),
    [answers, props.sections, props.size]
  );

  const coreSize = toCoreSize(props.size);
  const totalQuestions = props.sections.reduce((n, s) => n + s.questions.length, 0);

  /* ---------- autosave ---------- */
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ answers, debrief, targets });
  latest.current = { answers, debrief, targets };

  const flush = useCallback(async () => {
    const ids = Array.from(dirty.current);
    dirty.current.clear();
    const body: Record<string, unknown> = { activeMs: clockRef.current?.total() ?? props.activeMs };
    if (ids.length) {
      body.answers = ids
        .map((qid) => latest.current.answers.get(qid))
        .filter(Boolean)
        .map((a) => ({
          questionId: a!.questionId,
          answer: a!.answer,
          // Drop entries that hold nothing — an empty note with no photo is not
          // a record of anything.
          entries: a!.entries.filter((e) => e.note.trim() || e.who.trim() || e.photos.length),
        }));
    }
    body.debriefRole = latest.current.debrief.role || null;
    body.debriefName = latest.current.debrief.name || null;
    body.debriefNotes = latest.current.debrief.notes || null;
    body.debriefFeedback = latest.current.debrief.feedback || null;
    body.debriefEmail = latest.current.debrief.email || null;
    body.targets = latest.current.targets || null;

    setSaveState("saving");
    try {
      const res = await fetch(`/api/inspections/${props.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveState("saved");
    } catch {
      // Put the ids back so the next save retries them rather than losing work.
      ids.forEach((id) => dirty.current.add(id));
      setSaveState("error");
    }
  }, [props.id, props.activeMs]);

  const scheduleSave = useCallback(
    (questionId?: string) => {
      if (questionId) dirty.current.add(questionId);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    [flush]
  );

  // A last save on the way out, so closing the tab mid-visit doesn't lose the
  // final answer or the clock.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  /* ---------- editing ---------- */
  function update(questionId: string, fn: (a: AnswerState) => AnswerState) {
    setAnswers((prev) => {
      const next = new Map(prev);
      const current = prev.get(questionId) ?? { questionId, answer: null, entries: [] };
      next.set(questionId, fn(withEntry(current)));
      return next;
    });
    scheduleSave(questionId);
  }

  const setAnswer = (qid: string, value: string | null) =>
    update(qid, (a) => ({ ...a, answer: a.answer === value ? null : value }));

  const setEntry = (qid: string, index: number, patch: Partial<Entry>) =>
    update(qid, (a) => ({
      ...a,
      entries: a.entries.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));

  const addEntry = (qid: string) => update(qid, (a) => ({ ...a, entries: [...a.entries, emptyEntry()] }));

  const removeEntry = (qid: string, index: number) =>
    update(qid, (a) => {
      const entries = a.entries.filter((_, i) => i !== index);
      return { ...a, entries: entries.length ? entries : [emptyEntry()] };
    });

  /* ---------- submit ---------- */
  async function submit() {
    await flush();
    const res = await fetch(`/api/inspections/${props.id}/submit`, { method: "POST" });
    const body = await res.json();
    if (res.status === 422) {
      setBlockers(body);
      return;
    }
    if (!res.ok) {
      setSaveState("error");
      return;
    }
    router.push(`/inspections/${props.id}/report`);
  }

  const section = props.sections[sectionIndex];
  const sectionDone = (i: number) =>
    props.sections[i].questions.filter((q) => {
      const a = answers.get(q.id);
      return a?.answer != null && a.answer !== "";
    }).length;

  return (
    <div className="min-h-screen pb-28">
      <TopBar
        centreName={props.centreName}
        size={props.size}
        pct={score.pct}
        verdict={score.verdict.word}
        criticalCount={score.criticalFails.length}
        activeMs={props.activeMs}
        onClock={(c) => {
          clockRef.current = c;
        }}
        saveState={saveState}
      />

      <div className="mx-auto max-w-3xl px-4">
        <SectionTabs
          titles={props.sections.map((s) => s.title)}
          counts={props.sections.map((_, i) => ({ done: sectionDone(i), total: props.sections[i].questions.length }))}
          current={onDebrief ? -1 : sectionIndex}
          onPick={(i) => {
            setOnDebrief(false);
            setSectionIndex(i);
            window.scrollTo(0, 0);
          }}
          onDebrief={() => {
            setOnDebrief(true);
            window.scrollTo(0, 0);
          }}
        />

        {onDebrief ? (
          <DebriefPanel
            debrief={debrief}
            targets={targets}
            score={score}
            blockers={blockers}
            onDebrief={(patch) => {
              setDebrief((d) => ({ ...d, ...patch }));
              scheduleSave();
            }}
            onTargets={(t) => {
              setTargets(t);
              scheduleSave();
            }}
            onSubmit={submit}
            answeredCount={totalQuestions - score.unanswered}
            totalQuestions={totalQuestions}
            onJumpTo={(questionText) => {
              const idx = props.sections.findIndex((s) => s.questions.some((q) => q.text === questionText));
              if (idx >= 0) {
                setOnDebrief(false);
                setSectionIndex(idx);
                window.scrollTo(0, 0);
              }
            }}
          />
        ) : (
          <>
            <h2 className="mt-6 text-lg font-bold text-navy">{section.title}</h2>
            <ol className="mt-3 space-y-3">
              {section.questions.map((q, i) => {
                const state = withEntry(answers.get(q.id) ?? { questionId: q.id, answer: null, entries: [] });
                const item = toCoreItem(q, {
                  questionId: q.id,
                  answer: state.answer,
                  entries: state.entries.map((e) => ({
                    note: e.note,
                    who: e.who,
                    photos: e.photos.map((url) => ({ url })),
                  })),
                });
                return (
                  <QuestionCard
                    key={q.id}
                    number={i + 1}
                    question={q}
                    state={state}
                    options={optionsFor(item)}
                    guide={resolveGuide(item, coreSize)}
                    scored={score.answers.find((a) => a.questionId === q.id)}
                    onAnswer={(v) => setAnswer(q.id, v)}
                    onEntry={(idx, patch) => setEntry(q.id, idx, patch)}
                    onAddEntry={() => addEntry(q.id)}
                    onRemoveEntry={(idx) => removeEntry(q.id, idx)}
                  />
                );
              })}
            </ol>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setSectionIndex((i) => Math.max(0, i - 1));
                  window.scrollTo(0, 0);
                }}
                disabled={sectionIndex === 0}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium disabled:opacity-40"
              >
                Previous
              </button>
              {sectionIndex < props.sections.length - 1 ? (
                <button
                  onClick={() => {
                    setSectionIndex((i) => i + 1);
                    window.scrollTo(0, 0);
                  }}
                  className="flex-1 rounded-lg bg-navy px-4 py-2.5 font-semibold text-white"
                >
                  Next section
                </button>
              ) : (
                <button
                  onClick={() => {
                    setOnDebrief(true);
                    window.scrollTo(0, 0);
                  }}
                  className="flex-1 rounded-lg bg-navy px-4 py-2.5 font-semibold text-white"
                >
                  Go to debrief
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- chrome ---------- */

function TopBar(props: {
  centreName: string;
  size: CentreSize;
  pct: number;
  verdict: string;
  criticalCount: number;
  activeMs: number;
  onClock: (c: { total: () => number }) => void;
  saveState: "saved" | "saving" | "error";
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Wordmark className="text-sm" />
          <p className="truncate text-sm font-semibold text-slate-800">
            {props.centreName}
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
              {SIZE_SHORT[props.size]}
            </span>
          </p>
        </div>
        <Clock startMs={props.activeMs} onReady={props.onClock} />
        <div className="text-right">
          <p className="text-xl font-bold leading-none" style={{ color: VERDICT_COLOR[props.verdict] ?? "#1C1960" }}>
            {props.pct}%
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            {props.saveState === "saving" ? "Saving…" : props.saveState === "error" ? "Not saved" : "Saved"}
          </p>
        </div>
      </div>
      {props.criticalCount > 0 && (
        <p className="bg-red-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
          ⚠ {props.criticalCount} critical {props.criticalCount === 1 ? "failure" : "failures"} — cannot be rated Good
        </p>
      )}
    </header>
  );
}

function Clock({ startMs, onReady }: { startMs: number; onReady: (c: { total: () => number }) => void }) {
  const clock = useActiveClock(startMs);
  // Braces matter: a concise arrow here would return onReady's value, and React
  // would take that object for the effect's cleanup and try to call it.
  useEffect(() => {
    onReady({ total: clock.total });
  }, [clock.total, onReady]);
  return <span className="tabular-nums text-sm font-medium text-slate-500">{fmtDuration(clock.display)}</span>;
}

function SectionTabs(props: {
  titles: string[];
  counts: { done: number; total: number }[];
  current: number;
  onPick: (i: number) => void;
  onDebrief: () => void;
}) {
  return (
    <nav className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2">
      {props.titles.map((t, i) => {
        const { done, total } = props.counts[i];
        const complete = done === total;
        return (
          <button
            key={t}
            onClick={() => props.onPick(i)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              props.current === i
                ? "border-navy bg-navy text-white"
                : complete
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {t}
            <span className="ml-1.5 opacity-70">
              {done}/{total}
            </span>
          </button>
        );
      })}
      <button
        onClick={props.onDebrief}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          props.current === -1 ? "border-navy bg-navy text-white" : "border-sky bg-sky-50 text-sky-800"
        }`}
      >
        Debrief &amp; submit
      </button>
    </nav>
  );
}
