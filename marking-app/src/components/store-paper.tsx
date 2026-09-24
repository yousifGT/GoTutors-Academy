"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendJson } from "@/lib/client";

type Found = { id: string; name: string; admissionNumber: string; yearGroup: string | null };

/**
 * "Do you want to keep this?" — the step at the end of quick marking.
 *
 * Searching by admission number is the default because that is what is written
 * on the paper, and because two children called Mohammed Ali is routine. If the
 * child is not on the system yet they can be added here, without leaving the
 * pile of papers half-marked.
 *
 * Discard is offered plainly rather than hidden, because a tutor testing the
 * marking on a scrap of paper should not have to keep it forever — but it is
 * only ever offered for a paper that has not been filed yet.
 */
export function StorePaper({
  submissionId,
  compact = false,
  onDone,
}: {
  submissionId: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newStudent, setNewStudent] = useState({ admissionNumber: "", name: "", yearGroup: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Debounced, so typing an admission number is one request rather than eight.
  useEffect(() => {
    if (adding) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(query)}`);
        const body = await res.json().catch(() => ({ students: [] }));
        if (!cancelled) setResults(body.students ?? []);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, adding]);

  async function store(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const result = await sendJson<{ existingStudentId?: string }>(
      `/api/submissions/${submissionId}/store`,
      "POST",
      payload
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      // The admission number is already taken — offer that child rather than
      // leaving the tutor to work out what happened.
      if (result.data.existingStudentId) {
        setAdding(false);
        setQuery(newStudent.admissionNumber);
      }
      return;
    }
    onDone?.();
    router.refresh();
  }

  async function discard() {
    setBusy(true);
    setError(null);
    const result = await sendJson(`/api/submissions/${submissionId}/store`, "DELETE");
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone?.();
    router.refresh();
  }

  return (
    <div className={compact ? "space-y-3" : "card space-y-3"}>
      {!compact && <h3 className="font-bold">Store this against a student</h3>}

      {adding ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              className="input"
              placeholder="Admission number"
              value={newStudent.admissionNumber}
              onChange={(e) => setNewStudent({ ...newStudent, admissionNumber: e.target.value })}
            />
            <input
              className="input"
              placeholder="Full name"
              value={newStudent.name}
              onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Year group (optional)"
              value={newStudent.yearGroup}
              onChange={(e) => setNewStudent({ ...newStudent, yearGroup: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary text-sm"
              disabled={busy || !newStudent.admissionNumber.trim() || !newStudent.name.trim()}
              onClick={() =>
                store({
                  newStudent: {
                    admissionNumber: newStudent.admissionNumber,
                    name: newStudent.name,
                    yearGroup: newStudent.yearGroup || null,
                  },
                })
              }
            >
              {busy ? "Storing…" : "Add and store"}
            </button>
            <button className="btn-ghost text-sm" onClick={() => setAdding(false)}>
              Back to search
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="Search by admission number or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {results.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => store({ studentId: s.id })}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm transition hover:border-sky/60 hover:bg-[var(--soft)]"
              >
                <span>
                  <span className="font-medium">{s.name}</span>
                  {s.yearGroup && <span className="ml-2 text-xs text-[var(--muted)]">{s.yearGroup}</span>}
                </span>
                <span className="font-mono text-xs text-[var(--muted)]">{s.admissionNumber}</span>
              </button>
            ))}
            {!searching && results.length === 0 && (
              <div className="px-1 py-2 text-sm text-[var(--muted)]">
                {query.trim() ? "Nobody matches that." : "No students yet."}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost text-sm" onClick={() => setAdding(true)}>
              New student
            </button>
            {confirmDiscard ? (
              <>
                <span className="text-xs text-coral">Discard this paper and its marks?</span>
                <button className="btn-danger text-xs" disabled={busy} onClick={discard}>
                  Yes, discard
                </button>
                <button className="btn-ghost text-xs" onClick={() => setConfirmDiscard(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn-ghost text-sm" onClick={() => setConfirmDiscard(true)}>
                Don&apos;t keep it
              </button>
            )}
          </div>
        </div>
      )}

      {error && <div className="text-sm text-coral">{error}</div>}
    </div>
  );
}
