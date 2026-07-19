"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Centre = { id: string; name: string; location: string; users: number };

export function CentresEditor({ centres }: { centres: Centre[] }) {
  const router = useRouter();
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
    <div className="space-y-6">
      {msg && (
        <div className={`gt-card border-l-4 px-4 py-2.5 text-sm ${msg.kind === "ok" ? "border-mint/60 text-mint" : "border-orange/60 text-orange"}`}>{msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}</div>
      )}
      <div className="gt-card p-5">
        <h3 className="font-bold mb-3">Add a centre</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="gt-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="gt-input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button onClick={add} disabled={busy || !name.trim()} className="gt-btn-primary">Add</button>
        </div>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead>
            <tr><th>Name</th><th>Location</th><th>Users</th><th className="text-right"></th></tr>
          </thead>
          <tbody>
            {centres.map((c) => (
              <tr key={c.id}>
                {editingId === c.id ? (
                  <>
                    <td>
                      <input
                        autoFocus
                        className="gt-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="gt-input"
                        placeholder="Location"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    </td>
                    <td><span className="gt-badge bg-[var(--soft)]">{c.users}</span></td>
                    <td className="text-right">
                      <button onClick={() => saveEdit(c.id)} disabled={busy} className="gt-btn-primary text-xs mr-2">Save</button>
                      <button onClick={() => setEditingId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="font-medium">{c.name}</td>
                    <td className="text-[var(--muted)]">{c.location || "—"}</td>
                    <td><span className="gt-badge bg-[var(--soft)]">{c.users}</span></td>
                    <td className="text-right">
                      <button onClick={() => startEdit(c)} className="gt-btn-ghost text-xs mr-2">Edit</button>
                      <button onClick={() => remove(c)} disabled={busy} className="px-1 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {centres.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-[var(--muted)]">No centres yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
