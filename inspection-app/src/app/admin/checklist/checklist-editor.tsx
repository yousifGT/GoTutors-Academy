"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LIMITS,
  QUESTION_TYPES,
  SIZES,
  TALLY_KEYS,
  TYPE_LABEL,
  blankQuestion,
  countOf,
  type Checklist,
  type ChecklistQuestion,
  type ChecklistQuestionType,
  type ChecklistSize,
  type TallyKey,
} from "@/lib/checklist";
import { SIZE_SHORT } from "@/lib/format";

/**
 * The checklist editor.
 *
 * The whole document is held here and saved in one request. That is deliberate:
 * a per-question API would need question ids to stay stable, and publishing a
 * new version necessarily creates new rows with new ids, so half an edit would
 * land against v13 and half against v14. One document, one save, one version.
 */

interface Row {
  key: string;
  q: ChecklistQuestion;
}

interface Group {
  key: string;
  title: string;
  questions: Row[];
}

interface Version {
  version: number;
  isActive: boolean;
  createdAt: string;
  inspections: number;
}

/** Keys are positional at mount so the first render is pure; new ones come from a counter. */
function toGroups(doc: Checklist): Group[] {
  return doc.sections.map((s, si) => ({
    key: `s${si}`,
    title: s.title,
    questions: s.questions.map((q, qi) => ({ key: `s${si}q${qi}`, q })),
  }));
}

function toChecklist(groups: Group[]): Checklist {
  return { sections: groups.map((g) => ({ title: g.title, questions: g.questions.map((r) => r.q) })) };
}

function move<T>(list: T[], from: number, by: number): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The problems that would make a question unanswerable, checked as you type so
 * the save button can say why it is disabled instead of the server saying no.
 * The same rules run again server-side — this is the courtesy, not the control.
 */
function problems(groups: Group[]): Map<string, string> {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  groups.forEach((g) => {
    if (!g.title.trim()) found.set(g.key, "This section needs a title.");
    g.questions.forEach((r) => {
      const q = r.q;
      const wording = q.text.trim().toLowerCase();
      if (!wording) found.set(r.key, "This question needs wording.");
      else if (seen.has(wording))
        found.set(r.key, "Another question is worded the same. A repeat finding is matched to the last visit by wording, so say which is which.");
      else if (q.type === "choice") {
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) found.set(r.key, "A multiple choice needs at least two options.");
        else if (new Set(opts).size !== opts.length) found.set(r.key, "Two options are the same.");
      } else if (q.type === "scale" && (q.max ?? 5) <= (q.min ?? 1)) {
        found.set(r.key, "The top of the scale must be above the bottom.");
      }
      if (wording) seen.add(wording);
    });
    if (g.questions.length === 0) found.set(g.key, "A section needs at least one question.");
  });
  return found;
}

export function ChecklistEditor({
  initial,
  version,
  name,
  inspections,
  drafts,
  history,
}: {
  initial: Checklist;
  version: number;
  name: string;
  inspections: number;
  drafts: number;
  history: Version[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>(() => toGroups(initial));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [baseVersion, setBaseVersion] = useState(version);
  const [used, setUsed] = useState(inspections);
  const [open, setOpen] = useState<string | null>(null);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);
  const key = () => `n${nextKey.current++}`;

  const doc = useMemo(() => toChecklist(groups), [groups]);
  const dirty = JSON.stringify(doc) !== baseline;
  const counts = countOf(doc);
  const faults = useMemo(() => problems(groups), [groups]);

  // A checklist is a long edit. Losing it to a stray tab close is the kind of
  // thing that stops people making corrections at all.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(sectionKey: string, questionKey: string, patch: Partial<ChecklistQuestion>) {
    setGroups((gs) =>
      gs.map((g) =>
        g.key !== sectionKey
          ? g
          : { ...g, questions: g.questions.map((r) => (r.key === questionKey ? { ...r, q: { ...r.q, ...patch } } : r)) }
      )
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    const res = await fetch("/api/template", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseVersion, checklist: doc }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save the checklist.");
      return;
    }
    setBaseline(JSON.stringify(doc));
    setBaseVersion(body.version);
    // A version that has just been created has been inspected against zero
    // times, so the next save edits it in place. Say the right thing straight
    // away rather than after a reload.
    setUsed(body.mode === "new-version" ? 0 : used);
    setNotice(
      body.mode === "new-version"
        ? `Published v${body.version}. Inspections already recorded stay on v${version}; new ones use v${body.version}.`
        : `Saved v${body.version}. Nothing had been inspected against it, so no new version was needed.`
    );
    router.refresh();
  }

  const blocked = faults.size > 0;

  return (
    <main className="mt-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Checklist</h1>
          <p className="text-sm text-slate-500">
            {name} · v{baseVersion} · {counts.sections} sections · {counts.questions} questions · {counts.critical}{" "}
            critical
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={busy || !dirty || blocked}
            className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : used > 0 ? `Publish v${baseVersion + 1}` : "Save changes"}
          </button>
        </div>
      </div>

      <SaveExplainer used={used} drafts={drafts} version={baseVersion} />

      {blocked && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          {faults.size} {faults.size === 1 ? "problem" : "problems"} to fix before this can be saved — the sections and
          questions holding one are outlined below.
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {notice && (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200">{notice}</p>
      )}

      <ul className="mt-6 space-y-3">
        {groups.map((g, gi) => {
          const expanded = open === g.key;
          const fault = faults.get(g.key);
          return (
            <li
              key={g.key}
              className={`overflow-hidden rounded-xl bg-white ring-1 ${
                fault ? "ring-red-300" : "ring-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 p-4">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : g.key)}
                  aria-expanded={expanded}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label={expanded ? `Collapse ${g.title}` : `Expand ${g.title}`}
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <input
                  value={g.title}
                  onChange={(e) =>
                    setGroups((gs) => gs.map((x) => (x.key === g.key ? { ...x, title: e.target.value } : x)))
                  }
                  aria-label={`Section ${gi + 1} title`}
                  className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 font-semibold text-slate-800 hover:border-slate-300 focus:border-sky focus:outline-none"
                />
                <span className="text-xs text-slate-500">
                  {g.questions.length} question{g.questions.length === 1 ? "" : "s"}
                </span>
                <Nudge onUp={() => setGroups((gs) => move(gs, gi, -1))} onDown={() => setGroups((gs) => move(gs, gi, 1))} first={gi === 0} last={gi === groups.length - 1} what="section" />
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Remove the section "${g.title}" and its ${g.questions.length} question(s)?`)) return;
                    setGroups((gs) => gs.filter((x) => x.key !== g.key));
                  }}
                  className="text-sm text-red-700 underline"
                >
                  Remove
                </button>
              </div>

              {fault && <p className="px-4 pb-3 text-xs text-red-700">{fault}</p>}

              {expanded && (
                <div className="border-t border-slate-200 bg-slate-50/60 p-4">
                  <ul className="space-y-2">
                    {g.questions.map((r, qi) => (
                      <QuestionRow
                        key={r.key}
                        row={r}
                        index={qi}
                        first={qi === 0}
                        last={qi === g.questions.length - 1}
                        fault={faults.get(r.key)}
                        expanded={openQuestion === r.key}
                        sections={groups.map((x) => ({ key: x.key, title: x.title }))}
                        sectionKey={g.key}
                        onToggle={() => setOpenQuestion(openQuestion === r.key ? null : r.key)}
                        onChange={(patch) => edit(g.key, r.key, patch)}
                        onMove={(by) =>
                          setGroups((gs) =>
                            gs.map((x) => (x.key === g.key ? { ...x, questions: move(x.questions, qi, by) } : x))
                          )
                        }
                        onMoveToSection={(target) => {
                          // Guard the no-op: without it the first branch would
                          // remove the question and the second would never run,
                          // so "move it to where it already is" would delete it.
                          if (target === g.key) return;
                          setGroups((gs) =>
                            gs.map((x) =>
                              x.key === g.key
                                ? { ...x, questions: x.questions.filter((y) => y.key !== r.key) }
                                : x.key === target
                                  ? { ...x, questions: [...x.questions, r] }
                                  : x
                            )
                          );
                        }}
                        onDuplicate={() =>
                          setGroups((gs) =>
                            gs.map((x) => {
                              if (x.key !== g.key) return x;
                              const copy = { key: key(), q: { ...r.q, text: `${r.q.text} (copy)` } };
                              const next = x.questions.slice();
                              next.splice(qi + 1, 0, copy);
                              return { ...x, questions: next };
                            })
                          )
                        }
                        onRemove={() => {
                          if (!confirm(`Remove "${r.q.text || "this question"}"?`)) return;
                          setGroups((gs) =>
                            gs.map((x) =>
                              x.key === g.key ? { ...x, questions: x.questions.filter((y) => y.key !== r.key) } : x
                            )
                          );
                          setOpenQuestion(null);
                        }}
                      />
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      const row = { key: key(), q: blankQuestion() };
                      setGroups((gs) =>
                        gs.map((x) => (x.key === g.key ? { ...x, questions: [...x.questions, row] } : x))
                      );
                      setOpenQuestion(row.key);
                    }}
                    disabled={g.questions.length >= LIMITS.questionsPerSection}
                    className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Add question
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          const g: Group = { key: key(), title: "New section", questions: [{ key: key(), q: blankQuestion() }] };
          setGroups((gs) => [...gs, g]);
          setOpen(g.key);
        }}
        disabled={groups.length >= LIMITS.sections}
        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm disabled:opacity-50"
      >
        Add section
      </button>

      <History history={history} />
    </main>
  );
}

function SaveExplainer({ used, drafts, version }: { used: number; drafts: number; version: number }) {
  if (used === 0)
    return (
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
        Nothing has been inspected against v{version} yet, so saving changes it where it stands. Once the first
        inspection is run against it, the next edit will publish v{version + 1} instead and leave this one as it was.
      </p>
    );
  return (
    <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <strong>
        {used} inspection{used === 1 ? " has" : "s have"} been carried out against v{version}
      </strong>
      , so saving publishes <strong>v{version + 1}</strong> and leaves v{version} untouched. Those{" "}
      {used === 1 ? "records keep" : "records keep"} the questions they were actually answered against, so their reports
      keep reading the same.
      {drafts > 0 && (
        <>
          {" "}
          {drafts} inspection{drafts === 1 ? " is" : "s are"} still in progress on v{version} and will finish there —
          questions will not appear or vanish mid-visit.
        </>
      )}
    </p>
  );
}

function Nudge({
  onUp,
  onDown,
  first,
  last,
  what,
}: {
  onUp: () => void;
  onDown: () => void;
  first: boolean;
  last: boolean;
  what: string;
}) {
  return (
    <span className="flex gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={first}
        aria-label={`Move ${what} up`}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={last}
        aria-label={`Move ${what} down`}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-30"
      >
        ↓
      </button>
    </span>
  );
}

function QuestionRow({
  row,
  index,
  first,
  last,
  fault,
  expanded,
  sections,
  sectionKey,
  onToggle,
  onChange,
  onMove,
  onMoveToSection,
  onDuplicate,
  onRemove,
}: {
  row: Row;
  index: number;
  first: boolean;
  last: boolean;
  fault?: string;
  expanded: boolean;
  sections: { key: string; title: string }[];
  sectionKey: string;
  onToggle: () => void;
  onChange: (patch: Partial<ChecklistQuestion>) => void;
  onMove: (by: number) => void;
  onMoveToSection: (key: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const q = row.q;
  return (
    <li className={`rounded-lg bg-white ring-1 ${fault ? "ring-red-300" : "ring-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm text-slate-800">{q.text || <em className="text-slate-400">Untitled question</em>}</p>
          <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            <span>{TYPE_LABEL[q.type]}</span>
            {q.critical && <Badge tone="red">critical{q.photoExempt ? ", written evidence" : ", photo on fail"}</Badge>}
            {q.requireNote && <Badge>note always</Badge>}
            {q.allowNA && <Badge>N/A allowed</Badge>}
            {q.whoField && <Badge>per tutor</Badge>}
            {q.scored && <Badge>scored</Badge>}
            {q.tally && <Badge>tally: {q.tally}</Badge>}
            {q.minBySize && <Badge>size targets</Badge>}
          </p>
        </button>
        <Nudge onUp={() => onMove(-1)} onDown={() => onMove(1)} first={first} last={last} what="question" />
        <button type="button" onClick={onDuplicate} className="rounded border border-slate-300 px-2 py-0.5 text-xs">
          Copy
        </button>
        <button type="button" onClick={onRemove} className="text-xs text-red-700 underline">
          Remove
        </button>
      </div>

      {fault && <p className="px-3 pb-2 text-xs text-red-700">{fault}</p>}

      {expanded && (
        <QuestionFields
          q={q}
          sections={sections}
          sectionKey={sectionKey}
          onChange={onChange}
          onMoveToSection={onMoveToSection}
        />
      )}
    </li>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "red" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 ${
        tone === "red" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

const lines = (v: string[] | null) => (v ?? []).join("\n");
const fromLines = (v: string): string[] | null => {
  const kept = v.split("\n").map((s) => s.trim()).filter(Boolean);
  return kept.length ? kept : null;
};

function QuestionFields({
  q,
  sections,
  sectionKey,
  onChange,
  onMoveToSection,
}: {
  q: ChecklistQuestion;
  sections: { key: string; title: string }[];
  sectionKey: string;
  onChange: (patch: Partial<ChecklistQuestion>) => void;
  onMoveToSection: (key: string) => void;
}) {
  return (
    <div className="space-y-4 border-t border-slate-200 p-4">
      <Field label="Question" hint="What the inspector reads on the day.">
        <textarea
          value={q.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Answer type" hint="Changing this clears the settings the old type used.">
          <select
            value={q.type}
            onChange={(e) => onChange(retype(q, e.target.value as ChecklistQuestionType))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section" hint="Move this question to another part of the checklist.">
          <select
            value={sectionKey}
            onChange={(e) => onMoveToSection(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {q.type === "scale" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bottom of the scale" hint="Scores 0%.">
            <NumberBox value={q.min ?? 1} onChange={(n) => onChange({ min: n })} />
          </Field>
          <Field label="Top of the scale" hint="Scores 100%.">
            <NumberBox value={q.max ?? 5} onChange={(n) => onChange({ max: n })} />
          </Field>
        </div>
      )}

      {q.type === "choice" && (
        <>
          <Field
            label="Options"
            hint="One per line. If this counts toward the score, put the best answer first and the worst last."
          >
            <textarea
              value={lines(q.options)}
              onChange={(e) => onChange({ options: fromLines(e.target.value) ?? [] })}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-sky"
            />
          </Field>
          <Check
            checked={q.scored}
            onChange={(v) => onChange({ scored: v })}
            label="Counts toward the score"
            hint="First option scores 100%, last scores 0%, the rest spread evenly between. Leave off and the answer is recorded as an observation instead."
          />
        </>
      )}

      {q.type === "number" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What is being counted" hint='Shown beside the box — "books", "passes".'>
              <input
                value={q.unit ?? ""}
                onChange={(e) => onChange({ unit: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
              />
            </Field>
            <Field label="Session counter" hint="Puts a tap-to-count button on the bar at the top of every screen.">
              <select
                value={q.tally ?? ""}
                onChange={(e) => onChange({ tally: (e.target.value || null) as TallyKey | null })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">No counter</option>
                {TALLY_KEYS.map((t) => (
                  <option key={t} value={t}>
                    {t === "standups" ? "Stand-ups — more is better" : "Distractions — fewer is better"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Minimum expected, by centre size"
            hint="A count below the target is flagged as an improvement point. It does not change the percentage — numbers are observations. Leave blank for no target."
          >
            <div className="flex flex-wrap gap-3">
              {SIZES.map((size) => (
                <label key={size} className="text-xs text-slate-600">
                  {SIZE_SHORT[size.toUpperCase() as "SMALL" | "MEDIUM" | "LARGE"]}
                  <input
                    type="number"
                    min={0}
                    value={q.minBySize?.[size] ?? ""}
                    onChange={(e) => onChange({ minBySize: withSize(q.minBySize, size, e.target.value) })}
                    className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
          </Field>
        </>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">How it is marked</legend>
        <div className="mt-2 space-y-2">
          <Check
            checked={q.critical}
            onChange={(v) => onChange({ critical: v, photoExempt: v ? q.photoExempt : false })}
            label="Critical"
            hint="Failing this caps the whole inspection at “Serious finding”, whatever the percentage."
          />
          {q.critical && (
            <div className="ml-6">
              <Check
                checked={q.photoExempt}
                onChange={(v) => onChange({ photoExempt: v })}
                label="Evidenced in writing, not by photograph"
                hint="For procedural or data-sensitive checks such as DBS records. Without this, failing a critical item requires a photo before the inspection can be submitted."
              />
            </div>
          )}
          <Check
            checked={q.requireNote}
            onChange={(v) => onChange({ requireNote: v })}
            label="Always needs a note"
            hint="Otherwise a clean pass may be left without one, and anything else must be explained."
          />
          <Check
            checked={q.allowNA}
            onChange={(v) => onChange({ allowNA: v })}
            label="May be marked not applicable"
            hint="An N/A answer is left out of the score entirely rather than counted as a failure."
          />
          <Check
            checked={q.whoField}
            onChange={(v) => onChange({ whoField: v })}
            label="Notes are per tutor"
            hint="Each note carries the name of the tutor it is about — used by the teaching observation sections."
          />
        </div>
      </fieldset>

      <details className="rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Guidance shown to the inspector</summary>
        <div className="mt-3 space-y-4">
          <Field label="What to look for" hint="Appears under the question when guidance is opened.">
            <textarea
              value={q.guide ?? ""}
              onChange={(e) => onChange({ guide: e.target.value || null })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Do" hint="One per line, shown in green.">
              <textarea
                value={lines(q.dos)}
                onChange={(e) => onChange({ dos: fromLines(e.target.value) })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
              />
            </Field>
            <Field label="Don't" hint="One per line, shown in red.">
              <textarea
                value={lines(q.donts)}
                onChange={(e) => onChange({ donts: fromLines(e.target.value) })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
              />
            </Field>
          </div>
          <Field
            label="Guidance that differs by centre size"
            hint="Replaces the text above when the inspection is that size. Leave blank to use the same guidance everywhere."
          >
            <div className="space-y-2">
              {SIZES.map((size) => (
                <label key={size} className="block text-xs text-slate-600">
                  {SIZE_SHORT[size.toUpperCase() as "SMALL" | "MEDIUM" | "LARGE"]}
                  <textarea
                    value={q.sizeGuide?.[size]?.text ?? ""}
                    onChange={(e) => onChange({ sizeGuide: withGuide(q.sizeGuide, size, e.target.value) })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </Field>
        </div>
      </details>
    </div>
  );
}

/**
 * Switching a question's type drops the settings the old type used.
 *
 * The server strips them anyway; doing it here too means the badges and the
 * form stop showing settings that have quietly stopped applying.
 */
function retype(q: ChecklistQuestion, type: ChecklistQuestionType): Partial<ChecklistQuestion> {
  return {
    type,
    options: type === "choice" ? (q.options ?? ["", ""]) : null,
    min: type === "scale" ? (q.min ?? 1) : null,
    max: type === "scale" ? (q.max ?? 5) : null,
    unit: type === "number" ? q.unit : null,
    minBySize: type === "number" ? q.minBySize : null,
    tally: type === "number" ? q.tally : null,
    scored: type === "choice" ? q.scored : false,
  };
}

function withSize(
  current: Partial<Record<ChecklistSize, number>> | null,
  size: ChecklistSize,
  raw: string
): Partial<Record<ChecklistSize, number>> | null {
  const next = { ...(current ?? {}) };
  if (raw.trim() === "" || Number.isNaN(Number(raw))) delete next[size];
  else next[size] = Math.max(0, Math.round(Number(raw)));
  return Object.keys(next).length ? next : null;
}

function withGuide(
  current: Partial<Record<ChecklistSize, { text: string }>> | null,
  size: ChecklistSize,
  raw: string
): Partial<Record<ChecklistSize, { text: string }>> | null {
  const next = { ...(current ?? {}) };
  if (!raw.trim()) delete next[size];
  else next[size] = { text: raw };
  return Object.keys(next).length ? next : null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {hint && <p className="mb-1 text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

function NumberBox({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Math.round(Number(e.target.value) || 0))}
      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
    />
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-sky-600"
      />
      <span>
        <span className="font-medium text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function History({ history }: { history: Version[] }) {
  if (history.length < 2) return null;
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Versions</h2>
      <p className="mt-1 text-xs text-slate-500">
        Every inspection keeps the version it was carried out against, so an old report still shows the questions that
        were actually asked.
      </p>
      <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        {history.map((h) => (
          <li key={h.version} className="flex items-center gap-3 p-3 text-sm">
            <span className="font-medium text-slate-800">v{h.version}</span>
            {h.isActive && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">live</span>}
            <span className="text-xs text-slate-500">
              {h.inspections} inspection{h.inspections === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-xs text-slate-400">{new Date(h.createdAt).toLocaleDateString("en-GB")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
