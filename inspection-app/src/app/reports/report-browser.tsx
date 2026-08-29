"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VERDICT_COLOR } from "@/components/brand";
import { SIZE_SHORT, shortDate } from "@/lib/format";
import { fmtDuration } from "@/lib/core";

interface Row {
  id: string;
  date: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  status: "DRAFT" | "SUBMITTED";
  scorePct: number | null;
  verdict: string | null;
  activeMs: number;
  centre: { id: string; name: string };
  inspector: { id: string; name: string };
  deliveries: { deliveredAt: string; readAt: string | null }[];
}

function monthName(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ReportBrowser({
  centres,
  months,
  unread,
}: {
  centres: { id: string; name: string }[];
  months: string[];
  unread: number;
}) {
  const [centre, setCentre] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (centre) p.set("centre", centre);
    if (month) p.set("month", month);
    if (status) p.set("status", status);
    if (unreadOnly) p.set("unread", "1");
    if (q.trim()) p.set("q", q.trim());
    const res = await fetch(`/api/inspections?${p}`);
    setRows(res.ok ? await res.json() : []);
  }, [centre, month, status, unreadOnly, q]);

  // Typing filters as you go, but not on every keystroke — a search that fires
  // per character makes the list flicker and hammers the server.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const clear = () => {
    setCentre("");
    setMonth("");
    setStatus("");
    setUnreadOnly(false);
    setQ("");
  };
  const filtered = centre || month || status || unreadOnly || q;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search inspections"
          placeholder="Search centre, inspector or verdict…"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
        {centres.length > 1 && (
          <select
            aria-label="Filter by centre"
            value={centre}
            onChange={(e) => setCentre(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All centres</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter by month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="SUBMITTED">Completed</option>
          <option value="DRAFT">In progress</option>
        </select>
        {unread > 0 && (
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              unreadOnly ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            New only ({unread})
          </button>
        )}
        {filtered && (
          <button onClick={clear} className="px-2 text-sm text-sky-600 underline">
            Clear
          </button>
        )}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
          {filtered ? "Nothing matches those filters." : "No inspections yet."}
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">
            {rows.length} inspection{rows.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            {rows.map((r) => {
              const delivery = r.deliveries[0];
              const isNew = delivery && !delivery.readAt;
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 p-4 ${isNew ? "bg-sky-50/60" : ""}`}>
                  <Link
                    href={r.status === "DRAFT" ? `/inspections/${r.id}` : `/inspections/${r.id}/report`}
                    className="min-w-0 flex-1"
                  >
                    <p className="font-medium text-slate-800">
                      {r.centre.name}
                      {isNew && (
                        <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          New
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">
                      {shortDate(r.date)} · {SIZE_SHORT[r.size]} · {r.inspector.name}
                      {r.activeMs > 0 && ` · ${fmtDuration(r.activeMs)}`}
                    </p>
                  </Link>

                  {r.status === "DRAFT" ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      In progress
                    </span>
                  ) : (
                    <>
                      <span
                        className="text-right font-semibold"
                        style={{ color: VERDICT_COLOR[r.verdict ?? ""] ?? "#334155" }}
                      >
                        {r.scorePct}%<span className="block text-xs font-medium">{r.verdict}</span>
                      </span>
                      <a
                        href={`/api/inspections/${r.id}/pdf`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy"
                      >
                        PDF
                      </a>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
