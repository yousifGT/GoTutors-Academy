"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface QueuedRequest {
  id: string;
  status: string;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  centre: { id: string; name: string };
  head: { id: string; name: string; email: string };
  askedBy: { name: string; email: string };
  decidedBy: { name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn by the franchisee",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The approval queue.
 *
 * Rejecting asks for a reason before it will go through. Nothing enforces that
 * server-side — a reason is not a condition of the decision — but a franchisee
 * who is told no and not told why has to come and ask, and the person who has
 * to answer that is the one on this screen.
 */
export function RequestQueue({ pending, answered }: { pending: QueuedRequest[]; answered: QueuedRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function decide(r: QueuedRequest, decision: "APPROVED" | "REJECTED") {
    setBusy(r.id);
    setError("");
    const res = await fetch(`/api/head-requests/${r.id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note: notes[r.id]?.trim() || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Waiting for you ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-600 ring-1 ring-slate-200">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-amber-200">
                <p className="text-sm text-slate-800">
                  <span className="font-semibold">{r.askedBy.name}</span> asks for{" "}
                  <span className="font-semibold">{r.head.name}</span> to run{" "}
                  <Link href={`/centres/${r.centre.id}`} className="text-sky-600">
                    {r.centre.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.head.email} · asked {day(r.createdAt)}
                </p>
                {r.note && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{r.note}”</p>}

                <input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((v) => ({ ...v, [r.id]: e.target.value }))}
                  maxLength={500}
                  placeholder="Reply (optional) — required if you are saying no"
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decide(r, "APPROVED")}
                    disabled={busy === r.id}
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === r.id ? "Saving…" : `Approve — ${r.head.name} gets access`}
                  </button>
                  <button
                    onClick={() => decide(r, "REJECTED")}
                    disabled={busy === r.id || !(notes[r.id] ?? "").trim()}
                    title={(notes[r.id] ?? "").trim() ? "" : "Give a reason first"}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recently answered</h2>
          <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            {answered.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-slate-800">{r.head.name}</span>
                  <span className="text-slate-500">at {r.centre.name}</span>
                  <span className="ml-auto text-xs text-slate-600">{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Asked by {r.askedBy.name}
                  {r.decidedBy && ` · answered by ${r.decidedBy.name}`}
                  {r.decidedAt && ` · ${day(r.decidedAt)}`}
                  {r.decisionNote && ` — “${r.decisionNote}”`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
