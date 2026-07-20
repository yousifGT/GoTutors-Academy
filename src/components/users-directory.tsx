"use client";
import { useEffect, useMemo, useState } from "react";
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
type TrainedFilter = "all" | "trained" | "in-training";
type SortKey = "newest" | "name" | "last-login";

const PAGE_SIZE = 24;

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
  const [trained, setTrained] = useState<TrainedFilter>("all");
  const [centre, setCentre] = useState<string>("all");
  const [sub, setSub] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
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

  const centres = useMemo(
    () => [...new Set(users.map((u) => u.centreName ?? "No centre"))].sort(),
    [users]
  );
  const subPositions = useMemo(
    () => [...new Set(users.flatMap((u) => u.subPositions))].sort(),
    [users]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = users.filter((u) => {
      if (roleType !== "all" && u.roleType !== roleType) return false;
      if (status === "active" && !u.active) return false;
      if (status === "inactive" && u.active) return false;
      if (status === "never" && u.lastLoginAt) return false;
      if (trained === "trained" && !(u.roleType === "TRAINEE" && u.isTrained)) return false;
      if (trained === "in-training" && !(u.roleType === "TRAINEE" && !u.isTrained)) return false;
      if (centre !== "all" && (u.centreName ?? "No centre") !== centre) return false;
      if (sub !== "all" && !u.subPositions.includes(sub)) return false;
      if (needle) {
        const hay = `${u.name} ${u.email} ${u.roleName} ${u.position ?? ""} ${u.subPositions.join(" ")} ${u.centreName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "last-login") {
      rows.sort((a, b) => (b.lastLoginAt ? Date.parse(b.lastLoginAt) : 0) - (a.lastLoginAt ? Date.parse(a.lastLoginAt) : 0));
    }
    // "newest" keeps the server order (createdAt desc).
    return rows;
  }, [users, q, roleType, status, trained, centre, sub, sort]);

  // Jump back to page 1 whenever the result set changes shape.
  useEffect(() => { setPage(1); }, [q, roleType, status, trained, centre, sub, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={stats.total} icon="👥" tone="navy" />
        <StatCard label="Trainees" value={stats.trainees} icon="🎓" tone="mint" hint={`${stats.trained} fully trained`} />
        <StatCard label="Staff" value={stats.total - stats.trainees} icon="🧑‍🏫" tone="picton" hint="Instructors & admins" />
        <StatCard label="Never logged in" value={stats.never} icon="⏰" tone={stats.never > 0 ? "orange" : "mint"} hint={stats.never > 0 ? "Might need a welcome nudge" : "Everyone's been in"} />
      </div>

      {/* Filter bar */}
      <div className="gt-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="gt-input max-w-xs"
            placeholder="🔍 Search name, email, role, centre…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="gt-input w-auto" value={centre} onChange={(e) => setCentre(e.target.value)} title="Filter by centre">
            <option value="all">🏫 All centres</option>
            {centres.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="gt-input w-auto" value={sub} onChange={(e) => setSub(e.target.value)} title="Filter by sub-position">
            <option value="all">🧩 All sub-positions</option>
            {subPositions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="gt-input w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} title="Sort">
            <option value="newest">↕ Newest first</option>
            <option value="name">↕ Name A–Z</option>
            <option value="last-login">↕ Recently active</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRoleType("all")} className={pill(roleType === "all")}>
              All roles
              <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === "all" ? "bg-white/20" : "bg-[var(--card)]"}`}>{users.length}</span>
            </button>
            {ROLE_ORDER.filter((r) => (countByRole.get(r) ?? 0) > 0).map((r) => (
              <button key={r} onClick={() => setRoleType(r)} className={pill(roleType === r)}>
                {ROLE_LABEL[r] ?? r}
                <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === r ? "bg-white/20" : "bg-[var(--card)]"}`}>{countByRole.get(r)}</span>
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "inactive", "never"] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>
                {s === "all" ? "Any status" : s === "active" ? "Active" : s === "inactive" ? "Deactivated" : "Never logged in"}
              </button>
            ))}
          </div>
          {(roleType === "all" || roleType === "TRAINEE") && (
            <>
              <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
              <div className="flex flex-wrap gap-2">
                {(["all", "trained", "in-training"] as TrainedFilter[]).map((t) => (
                  <button key={t} onClick={() => setTrained(t)} className={pill(trained === t)}>
                    {t === "all" ? "Any training" : t === "trained" ? "🏅 Trained" : "In training"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Result count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--muted)]">
          {filtered.length === users.length
            ? `${filtered.length} user${filtered.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${users.length} users match`}
          {totalPages > 1 && ` · showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)}`}
        </span>
        {(q || roleType !== "all" || status !== "all" || trained !== "all" || centre !== "all" || sub !== "all") && (
          <button
            onClick={() => { setQ(""); setRoleType("all"); setStatus("all"); setTrained("all"); setCentre("all"); setSub("all"); }}
            className="gt-btn-ghost text-xs"
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No users match" hint="Try a different search or clear some filters." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((u) => (
            <div key={u.id} className={`gt-card group flex flex-col p-4 transition hover:border-picton/50 ${u.active ? "" : "opacity-70"}`}>
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

              <div className="mt-2.5 flex flex-1 flex-wrap content-start gap-1.5">
                <RoleChip type={u.roleType} label={u.roleName} />
                {u.roleType === "TRAINEE" && (u.isTrained
                  ? <span className="gt-badge bg-mint/15 text-mint">🏅 Trained</span>
                  : <span className="gt-badge bg-gold/15 text-gold">In training</span>)}
                {u.roleType === "TRAINEE"
                  ? u.subPositions.slice(0, 2).map((sp) => <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>)
                  : u.position && <span className="gt-badge bg-[var(--soft)]">💼 {u.position}</span>}
                {u.roleType === "TRAINEE" && u.subPositions.length > 2 && (
                  <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{u.subPositions.length - 2}</span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5 text-xs text-[var(--muted)]">
                <span className="truncate">🏫 {u.centreName ?? "No centre"}</span>
                <span className="shrink-0">
                  {u.lastLoginAt ? `Seen ${timeAgo(new Date(u.lastLoginAt))}` : <span className="gt-badge bg-gold/15 text-gold">Never logged in</span>}
                </span>
              </div>
              <div className="mt-1.5 opacity-0 transition group-hover:opacity-100">
                <TraineeRowActions userId={u.id} active={u.active} editHref={`/admin/users/${u.id}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(safePage - 1)} disabled={safePage === 1} className="gt-btn-ghost text-xs disabled:opacity-40">← Prev</button>
          <span className="px-2 text-sm text-[var(--muted)]">Page {safePage} of {totalPages}</span>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages} className="gt-btn-ghost text-xs disabled:opacity-40">Next →</button>
        </div>
      )}

      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
