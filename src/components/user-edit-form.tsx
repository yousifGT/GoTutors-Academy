"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pill } from "@/components/pill";
import { Avatar, RoleChip } from "@/components/page-ui";

type SP = { id: string; name: string; roleId: string };

export function UserEditForm({
  userId,
  initial,
  roles,
  centres,
  supervisors,
  subPositions,
  scope,
}: {
  userId: string;
  initial: {
    name: string;
    email: string;
    phone: string | null;
    position: string | null;
    subPositions: string[];
    isTrained: boolean;
    active: boolean;
    roleId: string;
    centreId: string | null;
    supervisorId: string | null;
  };
  roles: { id: string; name: string; type: string }[];
  centres: { id: string; name: string }[];
  supervisors: { id: string; name: string; role: string }[];
  subPositions: SP[];
  scope: "admin" | "centre";
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const role = roles.find((r) => r.id === form.roleId);
  const isTrainee = role?.type === "TRAINEE";
  const subsForRole = useMemo(() => subPositions.filter((s) => s.roleId === form.roleId), [subPositions, form.roleId]);

  function toggleSub(name: string) {
    setForm((f) => ({
      ...f,
      subPositions: f.subPositions.includes(name)
        ? f.subPositions.filter((x) => x !== name)
        : [...f.subPositions, name],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        position: isTrainee ? null : (form.position || null),
        subPositions: isTrainee ? form.subPositions : [],
        isTrained: form.isTrained,
        active: form.active,
        roleId: form.roleId,
        centreId: form.centreId || null,
        supervisorId: form.supervisorId || null,
        ...(password ? { password } : {}),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setMsg({ kind: "err", text: data.error ?? "Failed" });
    setPassword("");
    setMsg({ kind: "ok", text: "Saved ✓" });
    router.refresh();
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Identity header */}
      <div className="gt-card flex items-center gap-4 p-5">
        <Avatar name={form.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold tracking-tight">{form.name || "—"}</div>
          <div className="truncate text-sm text-[var(--muted)]">{form.email}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {role && <RoleChip type={role.type} label={role.name} />}
          <span className={`gt-badge ${form.active ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
            {form.active ? "Active" : "Deactivated"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Profile */}
        <div className="gt-card space-y-3 p-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-picton/15 text-picton">👤</div>
            <h3 className="font-bold">Profile</h3>
          </div>
          <div><label className="gt-label">Full name</label><input className="gt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label className="gt-label">Email</label><input type="email" className="gt-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div><label className="gt-label">Phone</label><input type="tel" className="gt-input" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>

        {/* Role & positions */}
        <div className="gt-card space-y-3 p-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-magenta/15 text-magenta">🛡️</div>
            <h3 className="font-bold">Role & positions</h3>
          </div>
          <div>
            <label className="gt-label">Role</label>
            <select className="gt-input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value, subPositions: [] })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {scope === "admin" && (
              <p className="text-xs text-[var(--muted)] mt-1">Changing role here promotes/demotes the user (e.g. trained Trainee → Centre Admin).</p>
            )}
          </div>
          {isTrainee ? (
            <>
              <div>
                <label className="gt-label">Sub-positions</label>
                <div className="flex flex-wrap gap-2">
                  {subsForRole.map((s) => (
                    <Pill key={s.id} tone="magenta" selected={form.subPositions.includes(s.name)} onToggle={() => toggleSub(s.name)}>
                      {s.name}
                    </Pill>
                  ))}
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">The trainee is automatically enrolled in every published course assigned to any of these sub-positions.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isTrained}
                  onChange={(e) => setForm({ ...form, isTrained: e.target.checked })}
                />
                Trained (set automatically on full sub-position course completion; can override)
              </label>
            </>
          ) : (
            <div><label className="gt-label">Position</label><input className="gt-input" value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          )}
        </div>

        {/* Assignment */}
        <div className="gt-card space-y-3 p-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold">🏫</div>
            <h3 className="font-bold">Assignment</h3>
          </div>
          {scope === "admin" && (
            <div>
              <label className="gt-label">Centre</label>
              <select className="gt-input" value={form.centreId ?? ""} onChange={(e) => setForm({ ...form, centreId: e.target.value || null })}>
                <option value="">— none —</option>
                {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="gt-label">Supervisor</label>
            <select className="gt-input" value={form.supervisorId ?? ""} onChange={(e) => setForm({ ...form, supervisorId: e.target.value || null })}>
              <option value="">— none —</option>
              {supervisors.filter((s) => s.id !== userId).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1">A supervisor can view this user's certificates.</p>
          </div>
        </div>

        {/* Access */}
        <div className="gt-card space-y-3 p-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-mint/15 text-mint">🔑</div>
            <h3 className="font-bold">Access</h3>
          </div>
          <div><label className="gt-label">Reset password (optional)</label><input className="gt-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep existing" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        {msg && <span className={`text-sm ${msg.kind === "ok" ? "text-mint" : "text-orange"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
