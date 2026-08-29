"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CentreSize, CentreStatus } from "@prisma/client";
import { SIZE_LABEL, SIZE_SHORT } from "@/lib/format";

interface Centre {
  id: string;
  name: string;
  address: string | null;
  size: CentreSize | null;
  status: CentreStatus;
  sortOrder: number;
  _count: { inspections: number };
}

const SIZES: CentreSize[] = ["SMALL", "MEDIUM", "LARGE"];

export function CentreManager({ initial }: { initial: Centre[] }) {
  const router = useRouter();
  const [centres, setCentres] = useState(initial);
  const [editing, setEditing] = useState<Centre | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/centres?all=1");
    if (res.ok) setCentres(await res.json());
    router.refresh();
  };

  async function remove(c: Centre) {
    const warning =
      c._count.inspections > 0
        ? `${c.name} has ${c._count.inspections} inspection(s) on record, so it will be closed rather than deleted — the history stays. Continue?`
        : `Delete ${c.name}? It has never been inspected, so nothing is lost.`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/centres/${c.id}`, { method: "DELETE" });
    const body = await res.json();
    setNotice(res.ok ? (body.message ?? `${c.name} removed.`) : body.error);
    if (res.ok) refresh();
  }

  const open = centres.filter((c) => c.status === "OPEN");
  const closed = centres.filter((c) => c.status === "CLOSED");

  return (
    <main className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Centres</h1>
          <p className="text-sm text-slate-500">
            The sites that get inspected. Size sets the default targets for stock and toilet passes.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white hover:bg-navy-700"
        >
          Add centre
        </button>
      </div>

      {notice && (
        <p className="mt-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200">{notice}</p>
      )}

      {(adding || editing) && (
        <CentreForm
          centre={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            refresh();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <CentreList title={`Open (${open.length})`} centres={open} onEdit={setEditing} onRemove={remove} />
      {closed.length > 0 && (
        <CentreList title={`Closed (${closed.length})`} centres={closed} onEdit={setEditing} onRemove={remove} dim />
      )}
    </main>
  );
}

function CentreList({
  title,
  centres,
  onEdit,
  onRemove,
  dim,
}: {
  title: string;
  centres: Centre[];
  onEdit: (c: Centre) => void;
  onRemove: (c: Centre) => void;
  dim?: boolean;
}) {
  return (
    <>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ul
        className={`mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 ${
          dim ? "opacity-60" : ""
        }`}
      >
        {centres.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">{c.name}</p>
              <p className="text-xs text-slate-500">
                {c.size ? SIZE_SHORT[c.size] : "no default size"}
                {c.address && ` · ${c.address}`}
                {` · ${c._count.inspections} inspection${c._count.inspections === 1 ? "" : "s"}`}
              </p>
            </div>
            <button onClick={() => onEdit(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              Edit
            </button>
            <button onClick={() => onRemove(c)} className="text-sm text-red-700 underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CentreForm({
  centre,
  onDone,
  onCancel,
}: {
  centre: Centre | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(centre?.name ?? "");
  const [address, setAddress] = useState(centre?.address ?? "");
  const [size, setSize] = useState<CentreSize | "">(centre?.size ?? "");
  const [status, setStatus] = useState<CentreStatus>(centre?.status ?? "OPEN");
  const [sortOrder, setSortOrder] = useState(String(centre?.sortOrder ?? 0));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(centre ? `/api/centres/${centre.id}` : "/api/centres", {
      method: centre ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        address: address || null,
        size: size || null,
        status,
        sortOrder: Number(sortOrder) || 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not save.");
      return;
    }
    onDone();
  }

  return (
    <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold text-navy">{centre ? `Edit ${centre.name}` : "Add a centre"}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">Usual size</legend>
        <p className="text-xs text-slate-500">
          Pre-selected when an inspection starts. The inspector can still change it on the day.
        </p>
        <div className="mt-2 space-y-1.5">
          {SIZES.map((sz) => (
            <label key={sz} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="size" checked={size === sz} onChange={() => setSize(sz)} className="accent-sky-600" />
              {SIZE_LABEL[sz]}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-500">
            <input type="radio" name="size" checked={size === ""} onChange={() => setSize("")} className="accent-sky-600" />
            Not set
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CentreStatus)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="OPEN">Open — appears in the picker</option>
            <option value="CLOSED">Closed — hidden, history kept</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
          <span className="text-xs font-normal text-slate-400">Lower first; ties fall back to name.</span>
        </label>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={busy || !name}
          className="rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : centre ? "Save changes" : "Add centre"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5">
          Cancel
        </button>
      </div>
    </section>
  );
}
