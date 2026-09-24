"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/lib/client";

export type ReviewRow = {
  label: string;
  prompt: string;
  expectedAnswer: string;
  guidance?: string | null;
  available: number;
  awarded: number;
  transcript: string;
  comment: string;
  confidence: number;
  legible: boolean;
  flagged: boolean;
};

/**
 * A person marking, or correcting, a paper.
 *
 * Everything is editable, including what the reader thought the student wrote —
 * a mark attached to a misread answer teaches the wrong lesson, and this form's
 * other job is to produce the worked examples that the next paper is marked
 * against. The questions the reader was unsure about are opened first so the
 * tutor's eye lands where the work is.
 */
export function MarkReviewForm({
  submissionId,
  rows,
  overallComment,
  strengths,
  improvements,
}: {
  submissionId: string;
  rows: ReviewRow[];
  overallComment: string;
  strengths: string[];
  improvements: string[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState(rows);
  const [comment, setComment] = useState(overallComment);
  const [wentWell, setWentWell] = useState(strengths.join("\n"));
  const [toImprove, setToImprove] = useState(improvements.join("\n"));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = marks.reduce((sum, m) => sum + (Number.isFinite(m.awarded) ? m.awarded : 0), 0);
  const available = marks.reduce((sum, m) => sum + m.available, 0);

  function update(index: number, patch: Partial<ReviewRow>) {
    setMarks((current) => current.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await sendJson(`/api/submissions/${submissionId}/review`, "POST", {
        marks: marks.map((m) => ({
          label: m.label,
          awarded: Math.min(Math.max(Math.round(m.awarded) || 0, 0), m.available),
          transcript: m.transcript,
          comment: m.comment,
        })),
        overallComment: comment,
        strengths: wentWell.split("\n").map((s) => s.trim()).filter(Boolean),
      improvements: toImprove.split("\n").map((s) => s.trim()).filter(Boolean),
      note,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Mark by hand</h3>
        <span className="text-sm text-[var(--muted)]">
          Running total: <strong className="text-[var(--fg)]">{total}</strong> / {available}
        </span>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Every change you make here is kept as an example, and the next paper on the same question is marked the way you
        marked it.
      </p>

      <div className="space-y-4">
        {marks.map((m, i) => (
          <div
            key={m.label}
            className={`rounded-xl border p-4 ${m.flagged ? "border-amber/50 bg-amber/5" : "border-[var(--border)]"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold">
                Q{m.label} <span className="font-normal text-[var(--muted)]">({m.available} mark{m.available === 1 ? "" : "s"})</span>
              </div>
              {m.flagged && <span className="badge bg-amber/15 text-amber">Needs you</span>}
            </div>
            <div className="mt-1 text-sm">{m.prompt}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              Expected: {m.expectedAnswer}
              {m.guidance ? ` · ${m.guidance}` : ""}
            </div>

            <label className="mt-3 block text-xs font-medium text-[var(--muted)]">
              What the student wrote
              <textarea
                className="input mt-1 min-h-[52px]"
                value={m.transcript}
                placeholder={m.legible ? "" : "Nothing readable was found — type what you can see."}
                onChange={(e) => update(i, { transcript: e.target.value })}
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
              <label className="block text-xs font-medium text-[var(--muted)]">
                Marks
                <input
                  type="number"
                  min={0}
                  max={m.available}
                  className="input mt-1"
                  value={Number.isFinite(m.awarded) ? m.awarded : 0}
                  onChange={(e) => update(i, { awarded: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--muted)]">
                Comment to the student
                <input
                  className="input mt-1"
                  value={m.comment}
                  onChange={(e) => update(i, { comment: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <label className="block text-sm font-medium">
        Overall comment
        <textarea className="input mt-1 min-h-[70px]" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          What went well <span className="font-normal text-[var(--muted)]">(one per line)</span>
          <textarea className="input mt-1 min-h-[80px]" value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          What to work on <span className="font-normal text-[var(--muted)]">(one per line)</span>
          <textarea className="input mt-1 min-h-[80px]" value={toImprove} onChange={(e) => setToImprove(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Note for other staff <span className="font-normal text-[var(--muted)]">(not shown to the student)</span>
        <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <div className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-2 text-sm text-coral">{error}</div>}

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Save marks"}
      </button>
    </div>
  );
}
