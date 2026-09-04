"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/lib/format";

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * Who runs this centre, and — for the people allowed to say — changing it.
 *
 * A franchisee sees the picker for their own centres; head office and the super
 * admin see it everywhere. Everyone else sees the list and no controls, because
 * knowing who receives a centre's reports is useful to anybody who can read the
 * centre at all.
 */
export function CentreHeads({
  centreId,
  centreName,
  managers,
  candidates,
  mayAssign,
}: {
  centreId: string;
  centreName: string;
  managers: Person[];
  /** Every active head of centre, to pick from. Nobody is created here. */
  candidates: Person[];
  mayAssign: boolean;
}) {
  const router = useRouter();
  const heads = managers.filter((m) => m.role === "CENTRE_HEAD");
  const others = managers.filter((m) => m.role !== "CENTRE_HEAD");

  const [chosen, setChosen] = useState<string[]>(heads.map((h) => h.id));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const dirty =
    chosen.length !== heads.length || chosen.some((id) => !heads.some((h) => h.id === id));

  async function save() {
    setBusy(true);
    setNotice("");
    setError("");
    const res = await fetch(`/api/centres/${centreId}/heads`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headIds: chosen }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not save.");
      return;
    }
    setNotice(
      chosen.length
        ? `${centreName}'s reports now go to ${(body.managers ?? []).map((m: Person) => m.name).join(", ")}.`
        : `Nobody is set as head of ${centreName}.`
    );
    router.refresh();
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-navy">Who runs this centre</h2>
      <p className="text-sm text-slate-500">
        Everyone here receives its inspection reports and can read its history.
      </p>

      {managers.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Nobody receives this centre&apos;s reports.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {[...others, ...heads].map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-2 p-3 text-sm">
              <span className="font-medium text-slate-800">{m.name}</span>
              <span className="text-slate-500">{m.email}</span>
              <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mayAssign && (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Heads of centre</h3>
          <p className="text-xs text-slate-500">
            Pick from people who already have a head of centre account. Nobody is created here, and no other role can
            be assigned — {others.length > 0 ? "everyone else above stays as they are." : "this only changes heads of centre."}
          </p>

          {candidates.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              There are no head of centre accounts yet. A super admin creates them under People.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidates.map((c) => {
                const on = chosen.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosen((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))}
                    title={c.email}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      on ? "border-navy bg-navy text-white" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={save}
            disabled={busy || !dirty}
            className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>

          {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
