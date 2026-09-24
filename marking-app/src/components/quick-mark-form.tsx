"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { sendFile, sendJson } from "@/lib/client";

type Option = { id: string; label: string; hint?: string };
type Paper = { reference: string; files: File[] };

/**
 * Quick marking: a pile of papers, one scheme, no filing.
 *
 * The point is to keep a tutor's hands on the papers. No student is chosen, so
 * nothing stops to search for a child; each paper just gets whatever the tutor
 * writes on the top of it, and the filing question is asked once at the end,
 * on the results screen.
 *
 * Uploads happen paper by paper and the progress says which one, because a
 * silent minute with a pile of twenty is indistinguishable from a hang.
 */
export function QuickMarkForm({ schemes, aiEnabled }: { schemes: Option[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [schemeId, setSchemeId] = useState(schemes[0]?.id ?? "");
  const [papers, setPapers] = useState<Paper[]>([{ reference: "", files: [] }]);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const ready = papers.filter((p) => p.files.length > 0);

  function update(index: number, patch: Partial<Paper>) {
    setPapers((current) => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addFiles(index: number, list: FileList | null) {
    if (!list) return;
    update(index, { files: [...papers[index].files, ...Array.from(list)].slice(0, 12) });
    const input = inputs.current[index];
    if (input) input.value = "";
  }

  async function submit() {
    setError(null);
    if (!schemeId) return setError("Pick a mark scheme first.");
    if (ready.length === 0) return setError("Add photos for at least one paper.");

    try {
      const uploaded: { reference: string | null; pageUrls: string[] }[] = [];
      for (const [i, paper] of ready.entries()) {
        const pageUrls: string[] = [];
        for (const [p, file] of paper.files.entries()) {
          setStep(`Uploading paper ${i + 1} of ${ready.length}, page ${p + 1} of ${paper.files.length}…`);
          const uploaded = await sendFile("/api/uploads/paper", file);
          if (!uploaded.ok) throw new Error(`Paper ${i + 1}: ${uploaded.error}`);
          pageUrls.push(uploaded.data.url);
        }
        uploaded.push({ reference: paper.reference.trim() || null, pageUrls });
      }

      setStep("Saving the papers…");
      const created = await sendJson<{ batchId: string | null; submissions: { id: string }[] }>(
        "/api/submissions",
        "POST",
        { markSchemeId: schemeId, papers: uploaded }
      );
      if (!created.ok) throw new Error(created.error);

      const ids = created.data.submissions.map((s) => s.id);
      for (const [i, id] of ids.entries()) {
        setStep(
          aiEnabled
            ? `Marking paper ${i + 1} of ${ids.length} — this takes up to a minute each…`
            : `Queueing paper ${i + 1} of ${ids.length}…`
        );
        // A marking failure is not fatal: the paper is saved, and the results
        // screen offers the retry. So the outcome is read there, not here.
        await sendJson(`/api/submissions/${id}/mark`).catch(() => null);
      }

      router.push(created.data.batchId ? `/quick/${created.data.batchId}` : `/papers/${ids[0]}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep(null);
    }
  }

  const busy = step !== null;

  return (
    <div className="space-y-5">
      <div className="card">
        <label className="block text-sm font-medium">
          Mark scheme — all of these papers are marked against it
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

      <div className="space-y-3">
        {papers.map((paper, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Paper {i + 1}</span>
              {papers.length > 1 && (
                <button
                  className="text-xs text-coral hover:underline"
                  disabled={busy}
                  onClick={() => setPapers(papers.filter((_, index) => index !== i))}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              className="input"
              placeholder="Name or reference from the top of the paper (optional)"
              value={paper.reference}
              onChange={(e) => update(i, { reference: e.target.value })}
              disabled={busy}
            />
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              capture="environment"
              className="input"
              onChange={(e) => addFiles(i, e.target.files)}
              disabled={busy}
            />
            {paper.files.length > 0 && (
              <div className="text-xs text-[var(--muted)]">
                {paper.files.length} page{paper.files.length === 1 ? "" : "s"} ·{" "}
                <button
                  className="text-coral hover:underline"
                  disabled={busy}
                  onClick={() => update(i, { files: [] })}
                >
                  clear
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        className="btn-ghost"
        disabled={busy || papers.length >= 30}
        onClick={() => setPapers([...papers, { reference: "", files: [] }])}
      >
        Add another paper
      </button>

      {error && <div className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-2 text-sm text-coral">{error}</div>}
      {step && <div className="text-sm text-[var(--muted)]">{step}</div>}

      <div>
        <button onClick={submit} disabled={busy} className="btn-primary">
          {busy ? "Working…" : `Mark ${ready.length || ""} paper${ready.length === 1 ? "" : "s"}`.replace("  ", " ")}
        </button>
        <p className="mt-2 text-xs text-[var(--muted)]">
          You will be asked whether to store each result against a student once they are marked.
        </p>
      </div>
    </div>
  );
}
