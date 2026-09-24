"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { sendFile, sendJson } from "@/lib/client";

type Option = { id: string; label: string; hint?: string };

/**
 * Photograph a paper and send it to be marked.
 *
 * Three steps, deliberately separate: upload each page, create the submission,
 * then ask for it to be marked. If marking fails the paper is already saved —
 * the tutor presses a button again instead of finding the child and re-shooting
 * a test that has gone home in a bag.
 */
export function PaperUploadForm({
  students,
  schemes,
  aiEnabled,
}: {
  students: Option[];
  schemes: Option[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [schemeId, setSchemeId] = useState(schemes[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 12));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setError(null);
    if (!studentId) return setError("Pick a student first.");
    if (!schemeId) return setError("Pick a mark scheme first.");
    if (files.length === 0) return setError("Add at least one photo of the paper.");

    try {
      const pageUrls: string[] = [];
      for (const [i, file] of files.entries()) {
        setStep(`Uploading page ${i + 1} of ${files.length}…`);
        const uploaded = await sendFile("/api/uploads/paper", file);
        if (!uploaded.ok) throw new Error(uploaded.error);
        pageUrls.push(uploaded.data.url);
      }

      setStep("Saving the paper…");
      const created = await sendJson<{ id: string }>("/api/submissions", "POST", {
        studentId,
        markSchemeId: schemeId,
        pageUrls,
      });
      if (!created.ok) throw new Error(created.error);
      const submissionId = created.data.id;

      setStep(aiEnabled ? "Marking — this takes up to a minute…" : "Adding to the marking queue…");
      // A failure here is not fatal: the paper is saved, and the report page
      // offers the retry. So the response is not checked for an error — it is
      // shown on the page the tutor is about to land on.
      await sendJson(`/api/submissions/${submissionId}/mark`).catch(() => null);

      router.push(`/papers/${submissionId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep(null);
    }
  }

  const busy = step !== null;

  return (
    <div className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Student</span>
          <select className="input mt-1" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={busy}>
            {students.length === 0 && <option value="">No students yet</option>}
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.hint ? ` · ${s.hint}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mark scheme</span>
          <select className="input mt-1" value={schemeId} onChange={(e) => setSchemeId(e.target.value)} disabled={busy}>
            {schemes.length === 0 && <option value="">No mark schemes yet</option>}
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.hint ? ` · ${s.hint}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="text-sm font-medium">Pages</span>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          One photo per page, in order. Flat on a table, good light, whole page in frame — JPEG, PNG or WebP, under 8 MB
          each.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          capture="environment"
          className="input mt-2"
          onChange={(e) => addFiles(e.target.files)}
          disabled={busy}
        />
        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-[var(--soft)] px-3 py-2">
                <span className="truncate">
                  Page {i + 1} · {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  className="text-xs text-coral hover:underline"
                  onClick={() => setFiles((current) => current.filter((_, index) => index !== i))}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-2 text-sm text-coral">{error}</div>}
      {step && <div className="text-sm text-[var(--muted)]">{step}</div>}

      <button onClick={submit} disabled={busy} className="btn-primary">
        {busy ? "Working…" : "Mark this paper"}
      </button>
    </div>
  );
}
