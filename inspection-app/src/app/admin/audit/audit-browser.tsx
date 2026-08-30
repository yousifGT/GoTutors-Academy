"use client";

import { useCallback, useEffect, useState } from "react";
import { GROUP_LABEL, describe, summarise, type AuditGroup } from "@/lib/audit-view";

interface Entry {
  id: string;
  action: string;
  at: string;
  metadata: unknown;
  actor: { id: string; name: string; email: string | null } | null;
  target: { id: string; kind: "inspection" | "other"; label: string | null } | null;
}

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditBrowser({
  groups,
  actors,
}: {
  groups: AuditGroup[];
  actors: { id: string; name: string }[];
}) {
  const [group, setGroup] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<{ entries: Entry[]; total: number; pageSize: number } | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (group) p.set("group", group);
    if (actor) p.set("actor", actor);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (q.trim()) p.set("q", q.trim());
    if (skip) p.set("skip", String(skip));
    const res = await fetch(`/api/audit?${p}`);
    setData(res.ok ? await res.json() : { entries: [], total: 0, pageSize: 100 });
  }, [group, actor, from, to, q, skip]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Any change to the filters starts again from the first page; staying on
  // page four of a different result set shows an empty screen for no reason.
  const change = (fn: () => void) => {
    setSkip(0);
    fn();
  };

  const filtered = group || actor || from || to || q;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          aria-label="Search activity"
          value={q}
          onChange={(e) => change(() => setQ(e.target.value))}
          placeholder="Search action or id…"
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
        {groups.length > 1 && (
          <select
            aria-label="Filter by kind"
            value={group}
            onChange={(e) => change(() => setGroup(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Everything</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter by person"
          value={actor}
          onChange={(e) => change(() => setActor(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Anyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          aria-label="From date"
          type="date"
          value={from}
          onChange={(e) => change(() => setFrom(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          aria-label="To date"
          type="date"
          value={to}
          onChange={(e) => change(() => setTo(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {filtered && (
          <button
            onClick={() =>
              change(() => {
                setGroup("");
                setActor("");
                setFrom("");
                setTo("");
                setQ("");
              })
            }
            className="px-2 text-sm text-sky-600 underline"
          >
            Clear
          </button>
        )}
      </div>

      {data === null ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : data.entries.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
          {filtered ? "Nothing matches those filters." : "Nothing recorded yet."}
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">
            {data.total} entr{data.total === 1 ? "y" : "ies"}
            {data.total > data.pageSize && ` · showing ${skip + 1}–${Math.min(skip + data.pageSize, data.total)}`}
          </p>
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            {data.entries.map((e) => {
              const meta = describe(e.action);
              return (
                <li key={e.id} className="p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`font-medium ${meta.notable ? "text-red-800" : "text-slate-800"}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-slate-400">{GROUP_LABEL[meta.group]}</span>
                    <span className="ml-auto text-xs tabular-nums text-slate-500">{when(e.at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {e.actor ? e.actor.name : "System"}
                    {e.target?.label && <span className="text-slate-500"> · {e.target.label}</span>}
                  </p>
                  {summarise(e.metadata).length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {summarise(e.metadata)
                        .map((m) => `${m.key}: ${m.value}`)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {data.total > data.pageSize && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => setSkip(Math.max(0, skip - data.pageSize))}
                disabled={skip === 0}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Newer
              </button>
              <button
                onClick={() => setSkip(skip + data.pageSize)}
                disabled={skip + data.pageSize >= data.total}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Older
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
