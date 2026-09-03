"use client";

import { useState } from "react";

/**
 * Take the rows on screen away as a spreadsheet.
 *
 * Two shapes, because two different questions get asked of the same data: one
 * row per inspection for "how are the centres doing", one row per answer for
 * "which questions keep failing". The links carry whatever filters are in play,
 * so the file matches the page rather than quietly covering everything.
 *
 * A plain link would be enough until the export refuses — over its size limit
 * it answers with a message, and a browser following a link would either show
 * raw JSON or nothing at all. So it is fetched, and either saved or explained.
 */
export function ExportMenu({
  params,
  centreId,
  label = "Export",
}: {
  params?: URLSearchParams;
  centreId?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState<"inspections" | "answers" | null>(null);
  const [error, setError] = useState("");

  async function download(type: "inspections" | "answers") {
    setBusy(type);
    setError("");
    const p = new URLSearchParams(params);
    if (centreId) p.set("centre", centreId);
    p.set("type", type);

    try {
      const res = await fetch(`/api/export?${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "The export could not be made.");
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${type}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      // Revoked on the next tick: released synchronously, Safari cancels the
      // download it was in the middle of starting.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("The export could not be made.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="relative inline-flex flex-col items-end">
      <span className="flex items-center gap-2">
        <span className="text-slate-500">{label}:</span>
        <button
          type="button"
          onClick={() => download("inspections")}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          {busy === "inspections" ? "Preparing…" : "Inspections"}
        </button>
        <button
          type="button"
          onClick={() => download("answers")}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          {busy === "answers" ? "Preparing…" : "Answers"}
        </button>
      </span>
      {error && (
        <span role="alert" className="mt-2 max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </span>
      )}
    </span>
  );
}
