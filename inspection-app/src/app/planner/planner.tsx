"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VERDICT_COLOR } from "@/components/brand";
import { shortDate } from "@/lib/format";

interface CoverageRow {
  centreId: string;
  centre: string;
  lastInspected: string | null;
  nextPlanned: string | null;
  daysSince: number | null;
  overdue: boolean;
  neverInspected: boolean;
  last: { date: string; scorePct: number | null; verdict: string | null } | null;
  nextInspector: string | null;
}

interface Visit {
  id: string;
  date: string;
  note: string | null;
  centre: { id: string; name: string };
  inspector: { id: string; name: string };
}

export function Planner({
  coverage,
  inspectors,
  visits,
  today,
}: {
  coverage: CoverageRow[];
  inspectors: { id: string; name: string }[];
  visits: Visit[];
  today: string;
}) {
  const router = useRouter();
  const [booking, setBooking] = useState<CoverageRow | null>(null);
  const [notice, setNotice] = useState("");

  async function cancel(v: Visit) {
    if (!confirm(`Cancel ${v.inspector.name}'s visit to ${v.centre.name} on ${shortDate(v.date)}?`)) return;
    const res = await fetch(`/api/visits/${v.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setNotice(res.ok ? "Visit cancelled." : (body.error ?? "Could not cancel."));
    if (res.ok) router.refresh();
  }

  const needs = coverage.filter((c) => c.overdue);
  const covered = coverage.filter((c) => !c.overdue);

  return (
    <>
      {notice && (
        <p className="mt-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200">{notice}</p>
      )}

      {booking && (
        <BookForm
          centre={booking}
          inspectors={inspectors}
          today={today}
          onDone={(msg) => {
            setBooking(null);
            setNotice(msg);
            router.refresh();
          }}
          onCancel={() => setBooking(null)}
        />
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-red-800">
        Needs a visit ({needs.length})
      </h2>
      {needs.length === 0 ? (
        <p className="mt-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Every centre has been inspected recently or has a visit booked.
        </p>
      ) : (
        <CentreTable rows={needs} onBook={setBooking} />
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Everything else ({covered.length})
      </h2>
      <CentreTable rows={covered} onBook={setBooking} />

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Booked ({visits.length})
      </h2>
      {visits.length === 0 ? (
        <p className="mt-2 rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">
          Nothing in the diary.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {visits.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">
                  {v.centre.name} — {v.inspector.name}
                </p>
                <p className="text-sm text-slate-500">
                  {shortDate(v.date)}
                  {v.date.slice(0, 10) === today && " · today"}
                  {v.note && ` · ${v.note}`}
                </p>
              </div>
              <button onClick={() => cancel(v)} className="text-sm text-red-700 underline">
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CentreTable({ rows, onBook }: { rows: CoverageRow[]; onBook: (r: CoverageRow) => void }) {
  return (
    <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
      {rows.map((r) => (
        <li key={r.centreId} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800">{r.centre}</p>
            <p className="text-sm text-slate-500">
              {r.neverInspected
                ? "Never inspected"
                : `Last inspected ${shortDate(r.lastInspected!)} · ${r.daysSince} days ago`}
              {r.nextPlanned && ` · next ${shortDate(r.nextPlanned)}${r.nextInspector ? ` (${r.nextInspector})` : ""}`}
            </p>
          </div>
          {r.last?.verdict && (
            <span
              className="text-right text-sm font-semibold"
              style={{ color: VERDICT_COLOR[r.last.verdict] ?? "#334155" }}
            >
              {r.last.scorePct}%<span className="block text-xs font-medium">{r.last.verdict}</span>
            </span>
          )}
          <button
            onClick={() => onBook(r)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy"
          >
            Book a visit
          </button>
        </li>
      ))}
    </ul>
  );
}

function BookForm({
  centre,
  inspectors,
  today,
  onDone,
  onCancel,
}: {
  centre: CoverageRow;
  inspectors: { id: string; name: string }[];
  today: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [inspectorId, setInspectorId] = useState(inspectors[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function book() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ centreId: centre.centreId, inspectorId, date, note: note || null }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not book that visit.");
      return;
    }
    onDone(`${inspectors.find((i) => i.id === inspectorId)?.name} is booked at ${centre.centre}.`);
  }

  return (
    <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold text-navy">Book a visit to {centre.centre}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* The select sits outside the label: a control nested inside one folds
            its own text — every option here — into the accessible name. */}
        <div>
          <label htmlFor="visit-inspector" className="block text-sm font-medium text-slate-700">
            Inspector
          </label>
          <select
            id="visit-inspector"
            value={inspectorId}
            onChange={(e) => setInspectorId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {inspectors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor="visit-date" className="block text-sm font-medium text-slate-700">
          Date
          <input
            id="visit-date"
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
        </label>
      </div>
      <label htmlFor="visit-note" className="mt-4 block text-sm font-medium text-slate-700">
        Note for the inspector
        <input
          id="visit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. follow up on the fire exit finding"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
      </label>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={book}
          disabled={busy || !inspectorId || !date}
          className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Booking…" : "Book visit"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5">
          Cancel
        </button>
      </div>
    </section>
  );
}
