"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pill } from "@/components/pill";

type SP = { id: string; name: string; roleId: string };

export function UserForm({
  roles,
  centres,
  subPositions,
  defaultRoleType,
  fixedCentreId,
  afterCreate,
}: {
  roles: { id: string; name: string; type: string }[];
  centres: { id: string; name: string }[];
  subPositions: SP[];
  defaultRoleType?: string;
  fixedCentreId?: string | null;
  afterCreate: string;
}) {
  const router = useRouter();
  const initialRole = roles.find((r) => r.type === defaultRoleType) ?? roles[0];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [roleId, setRoleId] = useState(initialRole?.id ?? "");
  const [centreId, setCentreId] = useState(fixedCentreId ?? centres[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const role = useMemo(() => roles.find((r) => r.id === roleId), [roles, roleId]);
  const isTrainee = role?.type === "TRAINEE";
  const subsForRole = useMemo(() => subPositions.filter((s) => s.roleId === roleId), [subPositions, roleId]);

  function toggleSub(name: string) {
    setSelectedSubs((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name, email, password,
        phone: phone || null,
        position: isTrainee ? null : position || null,
        subPositions: isTrainee ? selectedSubs : [],
        roleId,
        centreId: centreId || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return alert(data.error ?? "Failed");
    router.push(afterCreate);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="gt-card p-6 space-y-3">
      <div><label className="gt-label">Full name</label><input className="gt-input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div><label className="gt-label">Email</label><input type="email" className="gt-input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div><label className="gt-label">Temporary password</label><input className="gt-input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
      <div><label className="gt-label">Phone (optional)</label><input type="tel" className="gt-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div>
        <label className="gt-label">Role</label>
        <select className="gt-input" value={roleId} onChange={(e) => { setRoleId(e.target.value); setSelectedSubs([]); }}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {isTrainee ? (
        <div>
          <label className="gt-label">Sub-positions</label>
          <div className="flex flex-wrap gap-2">
            {subsForRole.map((s) => (
              <Pill key={s.id} tone="magenta" selected={selectedSubs.includes(s.name)} onToggle={() => toggleSub(s.name)}>
                {s.name}
              </Pill>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">The trainee is automatically enrolled in every published course assigned to any of these sub-positions.</p>
        </div>
      ) : (
        <div><label className="gt-label">Position</label><input className="gt-input" value={position} onChange={(e) => setPosition(e.target.value)} /></div>
      )}
      {!fixedCentreId && centres.length > 0 && (
        <div>
          <label className="gt-label">Centre</label>
          <select className="gt-input" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
            <option value="">— none —</option>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <button disabled={saving} className="gt-btn-primary">{saving ? "Creating…" : "Create user"}</button>
    </form>
  );
}
