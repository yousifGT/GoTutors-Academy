"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: string; name: string; type: string; description: string | null; userCount: number };
type SubPosition = { id: string; name: string; roleId: string; roleName: string; userCount: number };

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
    let msg = `Delete role "${role.name}"?`;
    if (role.userCount > 0) {
      msg += `\n\n⚠️ ${role.userCount} user(s) are currently assigned to this role. They must be reassigned first — the server will reject this deletion.`;
    }
    if (!confirm(msg)) return;
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

  const [newSubRoleId, setNewSubRoleId] = useState<string>(roles[0]?.id ?? "");
  const [newSubName, setNewSubName] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");

  async function createSubPosition() {
    if (!newSubName.trim() || !newSubRoleId) return;
    setBusy(true);
    const res = await fetch("/api/admin/sub-positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId: newSubRoleId, name: newSubName.trim() }),
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
    let msg = `Delete sub-position "${sp.name}" (${sp.roleName})?`;
    if (sp.userCount > 0) {
      msg += `\n\n⚠️ ${sp.userCount} user(s) currently have this sub-position. Reassign them first — the server will reject this deletion.`;
    }
    if (!confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/sub-positions/${sp.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash("err", data.error ?? "Failed");
    flash("ok", "Sub-position deleted");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      {msg && (
        <div className={`gt-card p-3 text-sm ${msg.kind === "ok" ? "text-mint" : "text-orange"}`}>
          {msg.text}
        </div>
      )}

      {/* ROLES */}
      <section>
        <h2 className="text-lg font-bold mb-3">Roles</h2>
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
                  <td><span className="gt-badge bg-lavender text-magenta">{r.type}</span></td>
                  <td className="text-sm text-[var(--muted)]">{r.description ?? "—"}</td>
                  <td>{r.userCount}</td>
                  <td className="text-right">
                    {editingRoleId === r.id ? (
                      <>
                        <button onClick={() => renameRole(r.id)} disabled={busy} className="text-xs text-mint mr-2">Save</button>
                        <button onClick={() => setEditingRoleId(null)} className="text-xs text-[var(--muted)]">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingRoleId(r.id); setEditingRoleName(r.name); }} className="text-xs text-picton mr-3">Rename</button>
                        <button onClick={() => deleteRole(r)} disabled={busy} className="text-xs text-orange">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {roles.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[var(--muted)]">No roles defined.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="gt-card p-5 mt-3">
          <h3 className="font-semibold mb-2">Add role</h3>
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
      </section>

      {/* SUB-POSITIONS */}
      <section>
        <h2 className="text-lg font-bold mb-3">Sub-positions</h2>
        <div className="space-y-4">
          {roles.map((r) => {
            const subs = subsByRole.get(r.id) ?? [];
            return (
              <div key={r.id} className="gt-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{r.name} <span className="text-xs text-[var(--muted)] ml-2">{subs.length} sub-position{subs.length === 1 ? "" : "s"}</span></h3>
                </div>
                {subs.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No sub-positions for this role.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {subs.map((s) => (
                      <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {editingSubId === s.id ? (
                            <input
                              autoFocus
                              className="gt-input"
                              value={editingSubName}
                              onChange={(e) => setEditingSubName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") renameSubPosition(s.id); if (e.key === "Escape") setEditingSubId(null); }}
                            />
                          ) : (
                            <>
                              <span className="font-medium">{s.name}</span>
                              <span className="text-xs text-[var(--muted)] ml-3">{s.userCount} user{s.userCount === 1 ? "" : "s"}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {editingSubId === s.id ? (
                            <>
                              <button onClick={() => renameSubPosition(s.id)} disabled={busy} className="text-xs text-mint">Save</button>
                              <button onClick={() => setEditingSubId(null)} className="text-xs text-[var(--muted)]">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingSubId(s.id); setEditingSubName(s.name); }} className="text-xs text-picton">Rename</button>
                              <button onClick={() => deleteSubPosition(s)} disabled={busy} className="text-xs text-orange">Delete</button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="gt-card p-5 mt-3">
          <h3 className="font-semibold mb-2">Add sub-position</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="gt-label">Role</label>
              <select className="gt-input" value={newSubRoleId} onChange={(e) => setNewSubRoleId(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="gt-label">Name</label>
              <input className="gt-input" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="e.g. Coding Tutor" />
            </div>
          </div>
          <button onClick={createSubPosition} disabled={busy || !newSubName.trim() || !newSubRoleId} className="gt-btn-primary mt-3">Add sub-position</button>
        </div>
      </section>
    </div>
  );
}
