"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: string; name: string; type: string; allowed: string[] };
type Perm = { id: string; key: string; label: string; description: string };
type Override = { userId: string; permissionId: string; allowed: boolean };
type UserLite = { id: string; name: string; email: string; role: string };

export function PermissionsMatrix({
  roles, permissions, users, overrides,
}: { roles: Role[]; permissions: Perm[]; users: UserLite[]; overrides: Override[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"roles" | "users">("roles");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  async function toggleRole(roleId: string, permissionId: string, allowed: boolean) {
    setBusy(true);
    await fetch("/api/permissions/role", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleId, permissionId, allowed }),
    });
    setBusy(false);
    router.refresh();
  }
  async function setUserOverride(userId: string, permissionId: string, value: "allow" | "deny" | "inherit") {
    setBusy(true);
    await fetch("/api/permissions/user", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, permissionId, value }),
    });
    setBusy(false);
    router.refresh();
  }

  const filteredUsers = useMemo(() => users.filter((u) =>
    !filter || (u.name + u.email + u.role).toLowerCase().includes(filter.toLowerCase())
  ), [users, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("roles")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "roles" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}>By role</button>
        <button onClick={() => setTab("users")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "users" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}>User overrides</button>
      </div>

      {tab === "roles" && (
        <div className="gt-card overflow-x-auto">
          <table className="gt-table min-w-[700px]">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => <th key={r.id}>{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <td><div className="font-medium">{p.label}</div><div className="text-xs text-[var(--muted)]">{p.description}</div></td>
                  {roles.map((r) => {
                    const checked = r.allowed.includes(p.id);
                    return (
                      <td key={r.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => toggleRole(r.id, p.id, !checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-3">
          <input className="gt-input max-w-sm" placeholder="Search users…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="gt-card overflow-x-auto">
            <table className="gt-table min-w-[700px]">
              <thead>
                <tr>
                  <th>User</th>
                  {permissions.map((p) => <th key={p.id}><span title={p.description}>{p.label}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td><div className="font-medium">{u.name}</div><div className="text-xs text-[var(--muted)]">{u.email} · {u.role}</div></td>
                    {permissions.map((p) => {
                      const ov = overrides.find((o) => o.userId === u.id && o.permissionId === p.id);
                      const state = ov ? (ov.allowed ? "allow" : "deny") : "inherit";
                      return (
                        <td key={p.id}>
                          <select
                            disabled={busy}
                            value={state}
                            onChange={(e) => setUserOverride(u.id, p.id, e.target.value as any)}
                            className="rounded-md text-xs border border-[var(--border)] bg-[var(--card)] py-1 px-2"
                          >
                            <option value="inherit">Inherit</option>
                            <option value="allow">Allow</option>
                            <option value="deny">Deny</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
