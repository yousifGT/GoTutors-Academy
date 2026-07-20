"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/page-ui";

type Centre = { id: string; name: string; location: string; users: number };

export function CentresEditor({ centres }: { centres: Centre[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/centres", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), location: location.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return flash("err", d.error ?? "Failed to add centre");
    }
    setName("");
    setLocation("");
    setAdding(false);
    flash("ok", "Centre added");
    router.refresh();
  }

  function startEdit(c: Centre) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditLocation(c.location);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/centres/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), location: editLocation.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return flash("err", d.error ?? "Failed to save centre");
    }
    setEditingId(null);
    flash("ok", "Centre updated");
    router.refresh();
  }

  async function remove(c: Centre) {
    let prompt = `Delete "${c.name}"?`;
    if (c.users > 0) {
      prompt += `\n\n⚠️ ${c.users} user(s) are assigned to this centre. Reassign them first — the server will reject this deletion.`;
    }
    if (!confirm(prompt)) return;
    setBusy(true);
    const res = await fetch(`/api/centres/${c.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return flash("err", d.error ?? "Failed to delete centre");
    }
    flash("ok", "Centre deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`gt-card border-l-4 px-4 py-2.5 text-sm ${msg.kind === "ok" ? "border-mint/60 text-mint" : "border-orange/60 text-orange"}`}>{msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {centres.map((c) => {
          const editing = editingId === c.id;
          return (
            <div key={c.id} className="gt-card group flex flex-col p-5 transition hover:border-picton/50">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/15 text-xl text-gold">🏫</div>
                {!editing && (
                  <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => startEdit(c)} className="gt-btn-ghost text-xs">Edit</button>
                    <button onClick={() => remove(c)} disabled={busy} className="px-1.5 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                  </div>
                )}
              </div>
              <div className="mt-3 min-w-0 flex-1">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      className="gt-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <input
                      className="gt-input"
                      placeholder="Location"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(c.id)} disabled={busy} className="gt-btn-primary text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Link
                      href={`/admin/centres/${c.id}`}
                      className="block text-left text-lg font-bold tracking-tight transition hover:text-picton"
                      title="Open centre — people, progress & stats"
                    >
                      {c.name} →
                    </Link>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">📍 {c.location || "No location set"}</p>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
                <div>
                  <div className="text-xl font-bold leading-tight">{c.users}</div>
                  <div className="text-xs text-[var(--muted)]">user{c.users === 1 ? "" : "s"} based here</div>
                </div>
                {!editing && <Link href={`/admin/centres/${c.id}`} className="gt-btn-ghost text-xs">Open →</Link>}
              </div>
            </div>
          );
        })}

        {/* Add-centre card */}
        {adding ? (
          <div className="gt-card border-picton/50 p-5">
            <h3 className="font-bold">New centre</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="gt-label">Name</label>
                <input autoFocus className="gt-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }} placeholder="e.g. Manchester Hub" />
              </div>
              <div>
                <label className="gt-label">Location</label>
                <input className="gt-input" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="City / address" />
              </div>
              <div className="flex gap-2">
                <button onClick={add} disabled={busy || !name.trim()} className="gt-btn-primary">Add centre</button>
                <button onClick={() => setAdding(false)} className="gt-btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="grid min-h-[11rem] place-items-center rounded-2xl border-2 border-dashed border-[var(--border)] p-5 text-[var(--muted)] transition hover:border-picton/60 hover:text-picton"
          >
            <span className="text-center">
              <span className="block text-3xl">＋</span>
              <span className="mt-1 block text-sm font-semibold">New centre</span>
            </span>
          </button>
        )}
      </div>

      {centres.length === 0 && !adding && (
        <EmptyState icon="🏫" title="No centres yet" hint="Click the card above to add your first centre." />
      )}
    </div>
  );
}
