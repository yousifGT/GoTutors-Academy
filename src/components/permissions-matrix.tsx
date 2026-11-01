"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Avatar, RoleChip } from "@/components/page-ui";

type Role = { id: string; name: string; type: string; allowed: string[] };
type Perm = { id: string; key: string; label: string; description: string };
type Override = { userId: string; permissionId: string; allowed: boolean };
type UserLite = { id: string; name: string; email: string; role: string; roleType: string };

/**
 * The table only offers changes the API will make. It used to offer every
 * checkbox and ignore the reply, so the super admin column and your own row —
 * both always refused by the API — flipped back on refresh with no word as to
 * why. Those are now locked, and any refusal is shown.
 */
export function PermissionsMatrix({
  roles, permissions, users, overrides, viewerId,
}: { roles: Role[]; permissions: Perm[]; users: UserLite[]; overrides: Override[]; viewerId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"roles" | "users">("roles");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({})))?.error ?? "That change wasn't saved.");
    setBusy(false);
    router.refresh();
  }
  const toggleRole = (roleId: string, permissionId: string, allowed: boolean) =>
    send("/api/permissions/role", { roleId, permissionId, allowed });
  const setUserOverride = (userId: string, permissionId: string, value: "allow" | "deny" | "inherit") =>
    send("/api/permissions/user", { userId, permissionId, value });

  const filteredUsers = useMemo(() => users.filter((u) =>
    !filter || (u.name + u.email + u.role).toLowerCase().includes(filter.toLowerCase())
  ), [users, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("roles")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "roles" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}>By role</button>
        <button onClick={() => setTab("users")} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "users" ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"}`}>User overrides</button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-orange/30 bg-orange/10 px-4 py-2.5 text-sm text-orange">{error}</div>
      )}

      {tab === "roles" && (
        <div className="gt-card overflow-x-auto">
          <table className="gt-table min-w-[700px]">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => (
                  <th key={r.id}>
                    {r.name}
                    {r.type === "SUPER_ADMIN" && <div className="text-[10px] font-normal normal-case text-[var(--muted)]">always every permission</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.id}>
                  <td><div className="font-medium">{p.label}</div><div className="text-xs text-[var(--muted)]">{p.description}</div></td>
                  {roles.map((r) => {
                    // The API refuses any change to the super admin role, so it
                    // could never stop anyone being able to manage permissions.
                    const locked = r.type === "SUPER_ADMIN";
                    const checked = locked || r.allowed.includes(p.id);
                    return (
                      <td key={r.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || locked}
                          title={locked ? "The super admin role always has every permission" : undefined}
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
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={permissions.length + 1} className="py-8 text-center text-sm text-[var(--muted)]">Nothing matches “{filter}”.</td></tr>
                )}
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium">{u.name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                            <span>{u.email}</span>
                            <RoleChip type={u.roleType} label={u.role} />
                          </div>
                        </div>
                      </div>
                    </td>
                    {permissions.map((p) => {
                      const ov = overrides.find((o) => o.userId === u.id && o.permissionId === p.id);
                      const state = ov ? (ov.allowed ? "allow" : "deny") : "inherit";
                      // The API refuses changes to your own permissions.
                      const self = u.id === viewerId;
                      return (
                        <td key={p.id}>
                          <select
                            disabled={busy || self}
                            title={self ? "You can't change your own permissions" : undefined}
                            value={state}
                            onChange={(e) => setUserOverride(u.id, p.id, e.target.value as any)}
                            className="gt-input w-auto px-2 py-1 text-xs"
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
