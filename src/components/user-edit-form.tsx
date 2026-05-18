"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
    position: string | null;
    subPosition: string | null;
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
  const [msg, setMsg] = useState<string | null>(null);

  const role = roles.find((r) => r.id === form.roleId);
  const isTrainee = role?.type === "TRAINEE";
  const subsForRole = useMemo(() => subPositions.filter((s) => s.roleId === form.roleId), [subPositions, form.roleId]);

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
        position: isTrainee ? null : (form.position || null),
        subPosition: isTrainee ? (form.subPosition || null) : null,
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
    if (!res.ok) return setMsg(data.error ?? "Failed");
    setPassword("");
    setMsg("Saved.");
    router.refresh();
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <form onSubmit={submit} className="gt-card p-6 space-y-3">
      <div><label className="gt-label">Full name</label><input className="gt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
      <div><label className="gt-label">Email</label><input type="email" className="gt-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
      <div>
        <label className="gt-label">Role</label>
        <select className="gt-input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {scope === "admin" && (
          <p className="text-xs text-[var(--muted)] mt-1">Changing role here promotes/demotes the user (e.g. trained Trainee → Centre Admin).</p>
        )}
      </div>
      {isTrainee ? (
        <>
          <div>
            <label className="gt-label">Sub-position</label>
            <select className="gt-input" value={form.subPosition ?? ""} onChange={(e) => setForm({ ...form, subPosition: e.target.value || null })}>
              <option value="">— none —</option>
              {subsForRole.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
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
      <div><label className="gt-label">Reset password (optional)</label><input className="gt-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep existing" /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
      </label>
      <div className="flex items-center gap-3">
        <button disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : "Save"}</button>
        {msg && <span className="text-sm text-mint">{msg}</span>}
      </div>
    </form>
  );
}
