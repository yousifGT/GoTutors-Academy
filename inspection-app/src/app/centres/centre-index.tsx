"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CentreSize, CentreStatus } from "@prisma/client";
import { SIZE_SHORT, shortDate } from "@/lib/format";
import { VERDICT_COLOR } from "@/components/brand";

export interface CentreRow {
  id: string;
  name: string;
  address: string | null;
  size: CentreSize | null;
  status: CentreStatus;
  inspections: number;
  latest: { date: string; scorePct: number | null; verdict: string | null; change: number | null } | null;
  heads: string[];
}

type Sort = "name" | "score" | "recent" | "movement";

const SORTS: { key: Sort; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "score", label: "Lowest score" },
  { key: "recent", label: "Longest since a visit" },
  { key: "movement", label: "Biggest fall" },
];

export function CentreIndex({ centres }: { centres: CentreRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [closed, setClosed] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kept = centres.filter(
      (c) =>
        (closed || c.status === "OPEN") &&
        (!needle ||
          c.name.toLowerCase().includes(needle) ||
          (c.address ?? "").toLowerCase().includes(needle) ||
          c.heads.some((h) => h.toLowerCase().includes(needle)))
    );
    const byName = (a: CentreRow, b: CentreRow) => a.name.localeCompare(b.name);
    return kept.slice().sort((a, b) => {
      if (sort === "score") {
        // A centre never inspected is not a low score; it goes last, and the
        // "longest since a visit" sort is the one that surfaces it.
        const av = a.latest?.scorePct ?? Infinity;
        const bv = b.latest?.scorePct ?? Infinity;
        return av !== bv ? av - bv : byName(a, b);
      }
      if (sort === "recent") {
        const av = a.latest ? Date.parse(a.latest.date) : -Infinity;
        const bv = b.latest ? Date.parse(b.latest.date) : -Infinity;
        return av !== bv ? av - bv : byName(a, b);
      }
      if (sort === "movement") {
        const av = a.latest?.change ?? Infinity;
        const bv = b.latest?.change ?? Infinity;
        return av !== bv ? av - bv : byName(a, b);
      }
      return byName(a, b);
    });
  }, [centres, q, sort, closed]);

  const never = rows.filter((c) => !c.latest).length;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search centres"
          placeholder="Search by centre, address or who runs it…"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
        <select
          aria-label="Order"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setClosed((v) => !v)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            closed ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          {closed ? "Including closed" : "Open only"}
        </button>
      </div>

      {never > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {never} of these {rows.length} {never === 1 ? "has" : "have"} never been inspected.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
          Nothing matches that.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/centres/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800">
                    {c.name}
                    {c.status === "CLOSED" && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">closed</span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {c.size ? SIZE_SHORT[c.size] : "no default size"}
                    {c.latest
                      ? ` · ${c.inspections} inspection${c.inspections === 1 ? "" : "s"} · last ${shortDate(c.latest.date)}`
                      : " · never inspected"}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {c.heads.length ? `Run by ${c.heads.join(", ")}` : (
                      <span className="text-amber-700">Nobody receives this centre&apos;s reports</span>
                    )}
                  </span>
                </span>

                {c.latest?.change != null && (
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      c.latest.change > 0
                        ? "text-emerald-700"
                        : c.latest.change < 0
                          ? "text-red-700"
                          : "text-slate-400"
                    }`}
                  >
                    {c.latest.change > 0 ? `▲ ${c.latest.change}` : c.latest.change < 0 ? `▼ ${Math.abs(c.latest.change)}` : "="}
                  </span>
                )}
                <span className="shrink-0 text-right font-semibold" style={{ color: VERDICT_COLOR[c.latest?.verdict ?? ""] ?? "#94a3b8" }}>
                  {c.latest?.scorePct != null ? `${c.latest.scorePct}%` : "—"}
                  <span className="block text-xs font-medium">{c.latest?.verdict ?? "no visits"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
