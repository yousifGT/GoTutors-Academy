"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CentreSize } from "@prisma/client";
import { SIZE_LABEL } from "@/lib/format";

const SIZES: CentreSize[] = ["SMALL", "MEDIUM", "LARGE"];

export function StartForm({
  centres,
}: {
  centres: { id: string; name: string; size: CentreSize | null }[];
}) {
  const router = useRouter();
  const [centreId, setCentreId] = useState("");
  const [size, setSize] = useState<CentreSize | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = centres.find((c) => c.id === centreId);

  // Selecting a centre pre-fills its usual size; the inspector can still change
  // it, because a centre can be busier or quieter than its default on the day.
  function pickCentre(id: string) {
    setCentreId(id);
    const c = centres.find((x) => x.id === id);
    if (c?.size) setSize(c.size);
  }

  async function start() {
    if (!centreId || !size) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ centreId, size }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not start the inspection.");
      setBusy(false);
      return;
    }
    router.push(`/inspections/${body.id}`);
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label htmlFor="centre" className="block text-sm font-semibold text-slate-700">
          Centre
        </label>
        <select
          id="centre"
          value={centreId}
          onChange={(e) => pickCentre(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
        >
          <option value="">Choose a centre…</option>
          {centres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Size today</legend>
        <p className="text-xs text-slate-500">
          This decides the targets some questions are marked against — stock levels, toilet passes.
        </p>
        <div className="mt-2 space-y-2">
          {SIZES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                size === s ? "border-sky bg-sky-50" : "border-slate-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="size"
                value={s}
                checked={size === s}
                onChange={() => setSize(s)}
                className="accent-sky-600"
              />
              <span className="text-sm">{SIZE_LABEL[s]}</span>
              {chosen?.size === s && <span className="ml-auto text-xs text-slate-400">usual</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        onClick={start}
        disabled={!centreId || !size || busy}
        className="w-full rounded-lg bg-navy px-4 py-3 font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start inspection"}
      </button>
    </div>
  );
}
