"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { nextLabel } from "@/lib/marking/labels";

export type QuestionDraft = {
  label: string;
  prompt: string;
  expectedAnswer: string;
  marks: number;
  guidance: string;
};

export type SchemeDraft = {
  title: string;
  subject: string;
  level: string;
  shared: boolean;
  questions: QuestionDraft[];
};

const EMPTY_QUESTION: QuestionDraft = { label: "", prompt: "", expectedAnswer: "", marks: 1, guidance: "" };

/**
 * Writing a mark scheme.
 *
 * `expectedAnswer` and `guidance` are the two fields that decide whether
 * marking is any good, so both are always visible rather than hidden behind an
 * "advanced" toggle. The guidance placeholder shows what a useful one reads
 * like, because a blank box gets left blank.
 */
export function SchemeEditor({ schemeId, initial }: { schemeId?: string; initial?: SchemeDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SchemeDraft>(
    initial ?? { title: "", subject: "", level: "", shared: true, questions: [{ ...EMPTY_QUESTION, label: "1" }] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalMarks = draft.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  function setQuestion(index: number, patch: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, questions: d.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) }));
  }

  function addQuestion() {
    setDraft((d) => ({
      ...d,
      // Guess the next label from the last one when it is a plain number, so a
      // 30-question paper isn't 30 manual labels.
      questions: [...d.questions, { ...EMPTY_QUESTION, label: nextLabel(d.questions.at(-1)?.label ?? "") }],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(schemeId ? `/api/schemes/${schemeId}` : "/api/schemes", {
      method: schemeId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        subject: draft.subject,
        level: draft.level || null,
        shared: draft.shared,
        questions: draft.questions.map((q) => ({
          label: q.label,
          prompt: q.prompt,
          expectedAnswer: q.expectedAnswer,
          marks: Number(q.marks) || 1,
          guidance: q.guidance || null,
        })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "That could not be saved.");
    if (schemeId) {
      setSaved(true);
      router.refresh();
    } else {
      router.push(`/schemes/${body.id}`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="card grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Title
          <input
            className="input mt-1"
            placeholder="Year 6 Arithmetic — Paper 1"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Subject
          <input
            className="input mt-1"
            placeholder="Maths"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
        </label>
        <label className="block text-sm font-medium">
          Level <span className="font-normal text-[var(--muted)]">(optional)</span>
          <input
            className="input mt-1"
            placeholder="Year 6 / KS2 / GCSE Foundation"
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value })}
          />
        </label>
        <label className="flex items-end gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="mb-2.5"
            checked={draft.shared}
            onChange={(e) => setDraft({ ...draft, shared: e.target.checked })}
          />
          <span className="mb-2">Everyone in the centre can mark against this</span>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">
          Questions <span className="font-normal text-[var(--muted)]">({totalMarks} marks in total)</span>
        </h3>
        <button onClick={addQuestion} className="btn-ghost text-sm">
          Add question
        </button>
      </div>

      <div className="space-y-4">
        {draft.questions.map((q, i) => (
          <div key={i} className="card space-y-3">
            <div className="grid gap-3 sm:grid-cols-[100px_100px_1fr]">
              <label className="block text-xs font-medium text-[var(--muted)]">
                Label
                <input
                  className="input mt-1"
                  placeholder="1a"
                  value={q.label}
                  onChange={(e) => setQuestion(i, { label: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--muted)]">
                Marks
                <input
                  type="number"
                  min={1}
                  className="input mt-1"
                  value={q.marks}
                  onChange={(e) => setQuestion(i, { marks: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--muted)]">
                The question, as printed
                <input
                  className="input mt-1"
                  placeholder="Work out 3/4 of 60"
                  value={q.prompt}
                  onChange={(e) => setQuestion(i, { prompt: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Expected answer
              <input
                className="input mt-1"
                placeholder="45"
                value={q.expectedAnswer}
                onChange={(e) => setQuestion(i, { expectedAnswer: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Marking guidance <span className="font-normal">(how to award part marks)</span>
              <input
                className="input mt-1"
                placeholder="1 mark for dividing by 4, 1 mark for the final answer. Accept 45 with or without units."
                value={q.guidance}
                onChange={(e) => setQuestion(i, { guidance: e.target.value })}
              />
            </label>
            {draft.questions.length > 1 && (
              <button
                className="text-xs text-coral hover:underline"
                onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, index) => index !== i) })}
              >
                Remove this question
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-2 text-sm text-coral">{error}</div>}
      {saved && <div className="text-sm text-teal">Saved.</div>}

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? "Saving…" : schemeId ? "Save changes" : "Create mark scheme"}
      </button>
    </div>
  );
}
