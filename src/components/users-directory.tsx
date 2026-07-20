"use client";
import { useMemo, useState } from "react";
import { Avatar, EmptyState, RoleChip, StatCard } from "@/components/page-ui";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { UserOverviewModal } from "@/components/user-overview-modal";
import { timeAgo } from "@/lib/utils";

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  roleType: string;
  position: string | null;
  subPositions: string[];
  isTrained: boolean;
  active: boolean;
  centreName: string | null;
  lastLoginAt: string | null; // ISO
};

type StatusFilter = "all" | "active" | "inactive" | "never";

const ROLE_ORDER = ["TRAINEE", "INSTRUCTOR", "CENTRE_ADMIN", "SUPER_ADMIN"];
const ROLE_LABEL: Record<string, string> = {
  TRAINEE: "Trainees",
  INSTRUCTOR: "Instructors",
  CENTRE_ADMIN: "Centre Admins",
  SUPER_ADMIN: "Super Admins",
};

export function UsersDirectory({ users }: { users: DirectoryUser[] }) {
  const [q, setQ] = useState("");
  const [roleType, setRoleType] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: users.length,
    trainees: users.filter((u) => u.roleType === "TRAINEE").length,
    trained: users.filter((u) => u.roleType === "TRAINEE" && u.isTrained).length,
    never: users.filter((u) => !u.lastLoginAt).length,
  }), [users]);

  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) m.set(u.roleType, (m.get(u.roleType) ?? 0) + 1);
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleType !== "all" && u.roleType !== roleType) return false;
      if (status === "active" && !u.active) return false;
      if (status === "inactive" && u.active) return false;
      if (status === "never" && u.lastLoginAt) return false;
      if (needle) {
        const hay = `${u.name} ${u.email} ${u.roleName} ${u.position ?? ""} ${u.subPositions.join(" ")} ${u.centreName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [users, q, roleType, status]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={stats.total} icon="👥" tone="navy" />
        <StatCard label="Trainees" value={stats.trainees} icon="🎓" tone="mint" hint={`${stats.trained} fully trained`} />
        <StatCard label="Staff" value={stats.total - stats.trainees} icon="🧑‍🏫" tone="picton" hint="Instructors & admins" />
        <StatCard label="Never logged in" value={stats.never} icon="⏰" tone={stats.never > 0 ? "orange" : "mint"} hint={stats.never > 0 ? "Might need a welcome nudge" : "Everyone's been in"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="gt-input max-w-xs"
          placeholder="🔍 Search name, email, role, centre…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "inactive", "never"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${status === s ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
            >
              {s === "all" ? "Everyone" : s === "active" ? "Active" : s === "inactive" ? "Deactivated" : "Never logged in"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleType("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${roleType === "all" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          All roles
          <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === "all" ? "bg-white/20" : "bg-[var(--card)]"}`}>{users.length}</span>
        </button>
        {ROLE_ORDER.filter((r) => (countByRole.get(r) ?? 0) > 0).map((r) => (
          <button
            key={r}
            onClick={() => setRoleType(r)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${roleType === r ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
          >
            {ROLE_LABEL[r] ?? r}
            <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === r ? "bg-white/20" : "bg-[var(--card)]"}`}>{countByRole.get(r)}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No users match" hint="Try a different search, role or status filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <div key={u.id} className={`gt-card group flex flex-col p-5 transition hover:border-picton/50 ${u.active ? "" : "opacity-70"}`}>
              <button
                type="button"
                onClick={() => setOpenUserId(u.id)}
                className="flex min-w-0 items-center gap-3 text-left"
                title="View full profile"
              >
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold transition group-hover:text-picton">{u.name}</span>
                    {!u.active && <span className="gt-badge shrink-0 bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{u.email}</div>
                </div>
              </button>

              <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
                <RoleChip type={u.roleType} label={u.roleName} />
                {u.roleType === "TRAINEE" && (u.isTrained
                  ? <span className="gt-badge bg-mint/15 text-mint">🏅 Trained</span>
                  : <span className="gt-badge bg-gold/15 text-gold">In training</span>)}
                {u.roleType === "TRAINEE"
                  ? u.subPositions.slice(0, 3).map((sp) => <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>)
                  : u.position && <span className="gt-badge bg-[var(--soft)]">💼 {u.position}</span>}
                {u.roleType === "TRAINEE" && u.subPositions.length > 3 && (
                  <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{u.subPositions.length - 3}</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                <span className="truncate">🏫 {u.centreName ?? "No centre"}</span>
                <span className="shrink-0">
                  {u.lastLoginAt ? `Seen ${timeAgo(new Date(u.lastLoginAt))}` : <span className="gt-badge bg-gold/15 text-gold">Never logged in</span>}
                </span>
              </div>
              <div className="mt-2 opacity-0 transition group-hover:opacity-100">
                <TraineeRowActions userId={u.id} active={u.active} editHref={`/admin/users/${u.id}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
