"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, RoleChip } from "@/components/page-ui";

type Role = { id: string; name: string; type: string; description: string | null; userCount: number };
type SubPosition = { id: string; name: string; roleId: string; roleName: string; userCount: number; courseCount: number };

const TYPE_STYLE: Record<string, { icon: string; bubble: string }> = {
  SUPER_ADMIN: { icon: "🛡️", bubble: "bg-magenta/15 text-magenta" },
  CENTRE_ADMIN: { icon: "🏫", bubble: "bg-gold/15 text-gold" },
  INSTRUCTOR: { icon: "🧑‍🏫", bubble: "bg-picton/15 text-picton" },
  TRAINEE: { icon: "🎓", bubble: "bg-mint/15 text-mint" },
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
  const [addingRole, setAddingRole] = useState(false);
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
    setNewRoleName(""); setNewRoleDesc(""); setAddingRole(false);
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
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "roles" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          Roles ({roles.length})
        </button>
        <button
          onClick={() => setTab("subs")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "subs" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const style = TYPE_STYLE[r.type] ?? TYPE_STYLE.SUPER_ADMIN;
            const subCount = (subsByRole.get(r.id) ?? []).length;
            const editing = editingRoleId === r.id;
            return (
              <div key={r.id} className="gt-card group flex flex-col p-5 transition hover:border-picton/50">
                <div className="flex items-start justify-between gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${style.bubble}`}>{style.icon}</div>
                  <RoleChip type={r.type} />
                </div>
                <div className="mt-3 min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        className="gt-input"
                        value={editingRoleName}
                        onChange={(e) => setEditingRoleName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameRole(r.id); if (e.key === "Escape") setEditingRoleId(null); }}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => renameRole(r.id)} disabled={busy} className="gt-btn-primary text-xs">Save</button>
                        <button onClick={() => setEditingRoleId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingRoleId(r.id); setEditingRoleName(r.name); }}
                        className="text-left text-lg font-bold tracking-tight transition hover:text-picton"
                        title="Click to rename"
                      >
                        {r.name}
                      </button>
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted)]">{r.description ?? "No description."}</p>
                    </>
                  )}
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
                  <div className="flex gap-5">
                    <div>
                      <div className="text-xl font-bold leading-tight">{r.userCount}</div>
                      <div className="text-xs text-[var(--muted)]">user{r.userCount === 1 ? "" : "s"}</div>
                    </div>
                    <button
                      onClick={() => { setActiveRoleId(r.id); setEditingSubId(null); setTab("subs"); }}
                      className="text-left transition hover:text-picton"
                      title="View sub-positions"
                    >
                      <div className="text-xl font-bold leading-tight">{subCount}</div>
                      <div className="text-xs text-[var(--muted)]">sub-position{subCount === 1 ? "" : "s"} →</div>
                    </button>
                  </div>
                  {!editing && (
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => { setEditingRoleId(r.id); setEditingRoleName(r.name); }} className="gt-btn-ghost text-xs">Rename</button>
                      <button onClick={() => deleteRole(r)} disabled={busy} className="px-1.5 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add-role card */}
          {addingRole ? (
            <div className="gt-card border-picton/50 p-5">
              <h3 className="font-bold">New role</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="gt-label">Name</label>
                  <input autoFocus className="gt-input" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createRole(); if (e.key === "Escape") setAddingRole(false); }} placeholder="e.g. Senior Centre Admin" />
                </div>
                <div>
                  <label className="gt-label">Base type</label>
                  <select className="gt-input" value={newRoleType} onChange={(e) => setNewRoleType(e.target.value)}>
                    {ROLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="gt-label">Description (optional)</label>
                  <input className="gt-input" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createRole(); }} />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Base type is permanent — it determines routing and default permissions.
                </p>
                <div className="flex gap-2">
                  <button onClick={createRole} disabled={busy || !newRoleName.trim()} className="gt-btn-primary">Add role</button>
                  <button onClick={() => setAddingRole(false)} className="gt-btn-ghost">Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingRole(true)}
              className="grid min-h-[11rem] place-items-center rounded-2xl border-2 border-dashed border-[var(--border)] p-5 text-[var(--muted)] transition hover:border-picton/60 hover:text-picton"
            >
              <span className="text-center">
                <span className="block text-3xl">＋</span>
                <span className="mt-1 block text-sm font-semibold">New role</span>
              </span>
            </button>
          )}
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

          {activeRole?.type === "TRAINEE" && (
            <p className="text-xs text-[var(--muted)]">Sub-positions drive automatic course enrolment — renames cascade to users and course assignments.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeSubs.map((s) => {
              const editing = editingSubId === s.id;
              return (
                <div key={s.id} className="gt-card group flex flex-col p-5 transition hover:border-picton/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-magenta/15 text-xl text-magenta">🧩</div>
                    {!editing && (
                      <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => { setEditingSubId(s.id); setEditingSubName(s.name); }} className="gt-btn-ghost text-xs">Rename</button>
                        <button onClick={() => deleteSubPosition(s)} disabled={busy} className="px-1.5 text-xs text-[var(--muted)] transition hover:text-orange">Delete</button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    {editing ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          className="gt-input"
                          value={editingSubName}
                          onChange={(e) => setEditingSubName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renameSubPosition(s.id); if (e.key === "Escape") setEditingSubId(null); }}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => renameSubPosition(s.id)} disabled={busy} className="gt-btn-primary text-xs">Save</button>
                          <button onClick={() => setEditingSubId(null)} className="gt-btn-ghost text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingSubId(s.id); setEditingSubName(s.name); }}
                        className="text-left text-lg font-bold tracking-tight transition hover:text-picton"
                        title="Click to rename"
                      >
                        {s.name}
                      </button>
                    )}
                  </div>
                  <div className="mt-4 flex gap-5 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xl font-bold leading-tight">{s.userCount}</div>
                      <div className="text-xs text-[var(--muted)]">user{s.userCount === 1 ? "" : "s"}</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold leading-tight">{s.courseCount}</div>
                      <div className="text-xs text-[var(--muted)]">course{s.courseCount === 1 ? "" : "s"} auto-enrol</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add sub-position card */}
            <div className="flex min-h-[11rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] p-5 text-center transition focus-within:border-picton/60 hover:border-picton/60">
              <span className="text-3xl text-[var(--muted)]">＋</span>
              <input
                className="gt-input max-w-[14rem] text-center"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createSubPosition(); }}
                placeholder={`New ${activeRole?.name ?? ""} sub-position`}
              />
              <button onClick={createSubPosition} disabled={busy || !newSubName.trim() || !activeRoleId} className="gt-btn-primary text-sm">Add</button>
            </div>
          </div>

          {activeSubs.length === 0 && (
            <EmptyState icon="🧩" title={`No ${activeRole?.name ?? ""} sub-positions yet`} hint="Type a name in the card above to add the first one — e.g. Coding Tutor." />
          )}
        </div>
      )}
    </div>
  );
}
