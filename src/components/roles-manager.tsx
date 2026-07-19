"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: string; name: string; type: string; description: string | null; userCount: number };
type SubPosition = { id: string; name: string; roleId: string; roleName: string; userCount: number };

const TYPE_CHIP: Record<string, string> = {
  SUPER_ADMIN: "bg-magenta/15 text-magenta",
  CENTRE_ADMIN: "bg-gold/15 text-gold",
  INSTRUCTOR: "bg-picton/15 text-picton",
  TRAINEE: "bg-mint/15 text-mint",
};

const ROLE_TYPES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "CENTRE_ADMIN", label: "Centre Admin" },
  { value: "INSTRUCTOR", label: "Instructor" },
  { value: "TRAINEE", label: "Trainee" },
];

export function RolesManager({ roles, subPositions }: { roles: Role[]; subPositions: SubPosition[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tab, setTab] = useState<"roles" | "subs">("roles");

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3000);
  }

  // ---------- Roles ----------
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleType, setNewRoleType] = useState("TRAINEE");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");

  async function createRole() {
    if (!newRoleName.trim()) return;
    setBusy(true);
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newRoleName.trim(), type: newRoleType, description: newRoleDesc.trim() || null }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return flash("err", data.error ?? "Failed");
    setNewRoleName(""); setNewRoleDesc("");
    flash("ok", "Role created");
    router.refresh();
  }

  async function renameRole(id: string) {
    if (!editingRoleName.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editingRoleName.trim() }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return flash("err", data.error ?? "Failed");
    setEditingRoleId(null);
    flash("ok", "Role renamed");
    router.refresh();
  }

  async function deleteRole(role: Role) {
    let text = `Delete role "${role.name}"?`;
    if (role.userCount > 0) {
      text += `\n\n⚠️ ${role.userCount} user(s) are currently assigned to this role. They must be reassigned first — the server will reject this deletion.`;
    }
    if (!confirm(text)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash("err", data.error ?? "Failed");
    flash("ok", "Role deleted");
    router.refresh();
  }

  // ---------- Sub-positions ----------
  const subsByRole = useMemo(() => {
    const map = new Map<string, SubPosition[]>();
    for (const s of subPositions) {
      const arr = map.get(s.roleId) ?? [];
      arr.push(s);
      map.set(s.roleId, arr);
    }
    return map;
  }, [subPositions]);

  const [activeRoleId, setActiveRoleId] = useState<string>(
    () => roles.find((r) => r.type === "TRAINEE")?.id ?? roles[0]?.id ?? ""
  );
  const activeRole = roles.find((r) => r.id === activeRoleId);
  const activeSubs = subsByRole.get(activeRoleId) ?? [];

  const [newSubName, setNewSubName] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");

  async function createSubPosition() {
    if (!newSubName.trim() || !activeRoleId) return;
    setBusy(true);
    const res = await fetch("/api/admin/sub-positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: activeRoleId, name: newSubName.trim() }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return flash("err", data.error ?? "Failed");
    setNewSubName("");
    flash("ok", "Sub-position added");
    router.refresh();
  }

  async function renameSubPosition(id: string) {
    if (!editingSubName.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/sub-positions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editingSubName.trim() }),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) return flash("err", data.error ?? "Failed");
    setEditingSubId(null);
    flash("ok", "Sub-position renamed (cascaded to users + courses)");
    router.refresh();
  }

  async function deleteSubPosition(sp: SubPosition) {
    let text = `Delete sub-position "${sp.name}" (${sp.roleName})?`;
    if (sp.userCount > 0) {
      text += `\n\n⚠️ ${sp.userCount} user(s) currently have this sub-position. Reassign them first — the server will reject this deletion.`;
    }
    if (!confirm(text)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/sub-positions/${sp.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash("err", data.error ?? "Failed");
    flash("ok", "Sub-position deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("roles")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "roles" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          Roles ({roles.length})
        </button>
        <button
          onClick={() => setTab("subs")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "subs" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          Sub-positions ({subPositions.length})
        </button>
      </div>

      {msg && (
        <div className={`gt-card border-l-4 px-4 py-2.5 text-sm ${msg.kind === "ok" ? "border-mint/60 text-mint" : "border-orange/60 text-orange"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      {/* ROLES TAB */}
      {tab === "roles" && (
        <div className="space-y-4">
          <div className="gt-card overflow-hidden">
            <table className="gt-table">
              <thead>
                <tr><th>Name</th><th>Base type</th><th>Description</th><th>Users</th><th className="text-right"></th></tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {editingRoleId === r.id ? (
                        <input
                          autoFocus
                          className="gt-input"
                          value={editingRoleName}
                          onChange={(e) => setEditingRoleName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renameRole(r.id); if (e.key === "Escape") setEditingRoleId(null); }}
                        />
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                    </td>
                    <td><span className={`gt-badge ${TYPE_CHIP[r.type] ?? "bg-lavender text-magenta"}`}>{r.type.replace("_", " ")}</span></td>
                    <td className="text-sm text-[var(--muted)]">{r.description ?? "—"}</td>
                    <td><span className="gt-badge bg-[var(--soft)]">{r.userCount}</span></td>
                    <td className="text-right">
                      {editingRoleId === r.id ? (
                        <>
                          <button onClick={() => renameRole(r.id)} disabled={busy} className="gt-btn-primary text-xs mr-2">Save</button>
                          <button onClick={() => setEditingRoleId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingRoleId(r.id); setEditingRoleName(r.name); }} className="gt-btn-ghost text-xs mr-2">Rename</button>
                          <button onClick={() => deleteRole(r)} disabled={busy} className="px-1 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[var(--muted)]">No roles defined.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="gt-card p-5">
            <h3 className="font-semibold mb-3">Add role</h3>
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-1">
                <label className="gt-label">Name</label>
                <input className="gt-input" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Senior Centre Admin" />
              </div>
              <div>
                <label className="gt-label">Base type</label>
                <select className="gt-input" value={newRoleType} onChange={(e) => setNewRoleType(e.target.value)}>
                  {ROLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="gt-label">Description (optional)</label>
                <input className="gt-input" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              Base type is permanent — it determines routing and default permissions. Pick whichever existing role this new one should behave like.
            </p>
            <button onClick={createRole} disabled={busy || !newRoleName.trim()} className="gt-btn-primary mt-3">Add role</button>
          </div>
        </div>
      )}

      {/* SUB-POSITIONS TAB */}
      {tab === "subs" && (
        <div className="space-y-4">
          {/* Role picker pills */}
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => {
              const count = (subsByRole.get(r.id) ?? []).length;
              const active = r.id === activeRoleId;
              return (
                <button
                  key={r.id}
                  onClick={() => { setActiveRoleId(r.id); setEditingSubId(null); }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
                >
                  {r.name}
                  <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${active ? "bg-white/20" : "bg-[var(--card)]"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="gt-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{activeRole?.name ?? "—"} sub-positions</h3>
              {activeRole?.type === "TRAINEE" && (
                <span className="text-xs text-[var(--muted)]">Sub-positions drive automatic course enrolment.</span>
              )}
            </div>

            {activeSubs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
                No sub-positions for {activeRole?.name ?? "this role"} yet — add the first one below.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {activeSubs.map((s) => (
                  <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {editingSubId === s.id ? (
                        <input
                          autoFocus
                          className="gt-input max-w-md"
                          value={editingSubName}
                          onChange={(e) => setEditingSubName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renameSubPosition(s.id); if (e.key === "Escape") setEditingSubId(null); }}
                        />
                      ) : (
                        <>
                          <span className="font-medium">{s.name}</span>
                          <span className="gt-badge ml-3 bg-[var(--soft)] text-xs">{s.userCount} user{s.userCount === 1 ? "" : "s"}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingSubId === s.id ? (
                        <>
                          <button onClick={() => renameSubPosition(s.id)} disabled={busy} className="gt-btn-primary text-xs">Save</button>
                          <button onClick={() => setEditingSubId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingSubId(s.id); setEditingSubName(s.name); }} className="gt-btn-ghost text-xs">Rename</button>
                          <button onClick={() => deleteSubPosition(s)} disabled={busy} className="px-1 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 border-t border-[var(--border)] pt-3">
              <input
                className="gt-input max-w-md"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createSubPosition(); }}
                placeholder={`Add a ${activeRole?.name ?? ""} sub-position — e.g. Coding Tutor`}
              />
              <button onClick={createSubPosition} disabled={busy || !newSubName.trim() || !activeRoleId} className="gt-btn-primary">Add</button>
            </div>
            <p className="text-xs text-[var(--muted)]">Renames cascade to users and course assignments automatically.</p>
          </div>
        </div>
      )}
    </div>
  );
}
