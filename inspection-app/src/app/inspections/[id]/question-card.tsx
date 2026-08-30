"use client";

import { useState } from "react";
import Image from "next/image";
import type { QuestionRow, ScoredAnswer } from "@/lib/score";
import type { AnswerState, Entry } from "./runner";

interface Props {
  number: number;
  question: QuestionRow;
  state: AnswerState;
  options: [string, string][];
  guide: { text: string; dos: string[]; donts: string[] };
  scored?: ScoredAnswer;
  /** The previous visit flagged this question. Shown before it is answered — the
   *  point is that the inspector looks, not that they are told afterwards. */
  flaggedLastVisit: boolean;
  onAnswer: (value: string | null) => void;
  onEntry: (index: number, patch: Partial<Entry>) => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
}

const BUCKET_STYLE: Record<string, string> = {
  WELL: "border-emerald-300 bg-emerald-50",
  IMPROVE: "border-red-300 bg-red-50",
  OBS: "border-sky-300 bg-sky-50",
  SKIP: "border-slate-200 bg-white",
};

export function QuestionCard(props: Props) {
  const { question: q, state, scored } = props;
  const [showGuide, setShowGuide] = useState(false);
  const hasGuide = !!(props.guide.text || props.guide.dos.length || props.guide.donts.length);

  const noteOwed = scored?.noteRequired && !state.entries.some((e) => e.note.trim());
  const photoOwed = scored?.photoRequired && !state.entries.some((e) => e.photos.length);

  return (
    <li className={`rounded-xl border p-4 ${BUCKET_STYLE[scored?.bucket ?? "SKIP"]}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-xs font-semibold text-slate-400">{props.number}</span>
        <div className="flex-1">
          <p className="font-medium text-slate-800">{q.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {q.critical && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Critical
              </span>
            )}
            {props.flaggedLastVisit && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  scored?.bucket === "IMPROVE" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {scored?.bucket === "IMPROVE" ? "Still not fixed" : "Flagged last visit"}
              </span>
            )}
            {q.photoExempt && q.critical && (
              <span className="text-[11px] text-slate-500">written evidence, not a photo</span>
            )}
            {hasGuide && (
              <button
                onClick={() => setShowGuide((v) => !v)}
                className="text-[11px] font-medium text-sky-700 underline"
              >
                {showGuide ? "Hide guidance" : "Guidance"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm ring-1 ring-slate-200">
          {props.guide.text && <p className="whitespace-pre-line text-slate-600">{props.guide.text}</p>}
          {props.guide.dos.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {props.guide.dos.map((d) => (
                <li key={d} className="text-emerald-800">
                  ✓ {d}
                </li>
              ))}
            </ul>
          )}
          {props.guide.donts.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {props.guide.donts.map((d) => (
                <li key={d} className="text-red-800">
                  ✗ {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* A number is typed; everything else is tapped. */}
      {q.type === "NUMBER" ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={state.answer ?? ""}
            onChange={(e) => props.onAnswer(e.target.value === "" ? null : e.target.value)}
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-lg tabular-nums outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
          />
          {q.unit && <span className="text-sm text-slate-500">{q.unit}</span>}
          {q.allowNA && (
            <button
              onClick={() => props.onAnswer("na")}
              className={`ml-auto rounded-lg border px-3 py-2 text-sm ${
                state.answer === "na" ? "border-slate-500 bg-slate-200" : "border-slate-300 bg-white"
              }`}
            >
              N/A
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {props.options.map(([value, label]) => (
            <button
              key={value}
              onClick={() => props.onAnswer(value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                state.answer === value
                  ? "border-navy bg-navy text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(noteOwed || photoOwed) && (
        <p className="mt-2 text-xs font-medium text-red-700">
          {noteOwed && "A note is required. "}
          {photoOwed && "Photo evidence is required."}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {state.entries.map((entry, i) => (
          <EntryEditor
            key={i}
            entry={entry}
            index={i}
            showWho={q.whoField}
            canRemove={state.entries.length > 1}
            onChange={(patch) => props.onEntry(i, patch)}
            onRemove={() => props.onRemoveEntry(i)}
          />
        ))}
        {/* Several entries per question: the teaching sections record one tutor
            at a time as the inspector moves between tables. */}
        <button onClick={props.onAddEntry} className="text-xs font-medium text-sky-700 underline">
          + Add another {q.whoField ? "tutor" : "note"}
        </button>
      </div>
    </li>
  );
}

function EntryEditor(props: {
  entry: Entry;
  index: number;
  showWho: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "photo");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(body.error ?? "Upload failed");
        break;
      }
      urls.push(body.url);
    }
    if (urls.length) props.onChange({ photos: [...props.entry.photos, ...urls] });
    setUploading(false);
  }

  return (
    <div className="rounded-lg bg-white/70 p-2 ring-1 ring-slate-200">
      {props.showWho && (
        <input
          value={props.entry.who}
          onChange={(e) => props.onChange({ who: e.target.value })}
          placeholder="Tutor name"
          className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky"
        />
      )}
      <textarea
        value={props.entry.note}
        onChange={(e) => props.onChange({ note: e.target.value })}
        placeholder="What did you see?"
        rows={2}
        className="w-full resize-y rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky"
      />

      {props.entry.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {props.entry.photos.map((url) => (
            <span key={url} className="relative">
              <Image
                src={url}
                alt="Evidence"
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded object-cover ring-1 ring-slate-300"
              />
              <button
                onClick={() => props.onChange({ photos: props.entry.photos.filter((p) => p !== url) })}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-slate-800 text-xs font-bold text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <label className="cursor-pointer text-xs font-medium text-sky-700 underline">
          {uploading ? "Uploading…" : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => addPhoto(e.target.files)}
            className="hidden"
          />
        </label>
        {props.canRemove && (
          <button onClick={props.onRemove} className="text-xs text-slate-500 underline">
            Remove
          </button>
        )}
        {uploadError && <span className="text-xs text-red-700">{uploadError}</span>}
      </div>
    </div>
  );
}
