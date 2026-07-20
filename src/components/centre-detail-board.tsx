"use client";
import { useMemo, useState } from "react";
import { Avatar, EmptyState, RoleChip } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { UserOverviewModal } from "@/components/user-overview-modal";
import { timeAgo } from "@/lib/utils";

export type CentreMember = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  roleType: string;
  subPositions: string[];
  isTrained: boolean;
  active: boolean;
  lastLoginAt: string | null; // ISO
  courses: number;
  completedCourses: number;
  avgPercent: number;
};

export type CentreCourse = {
  id: string;
  title: string;
  enrolled: number;
  completed: number;
  avgPercent: number;
};

const ROLE_ORDER = ["TRAINEE", "INSTRUCTOR", "CENTRE_ADMIN", "SUPER_ADMIN"];
const ROLE_LABEL: Record<string, string> = {
  TRAINEE: "Trainees",
  INSTRUCTOR: "Instructors",
  CENTRE_ADMIN: "Centre Admins",
  SUPER_ADMIN: "Super Admins",
};

export function CentreDetailBoard({ members, courses }: { members: CentreMember[]; courses: CentreCourse[] }) {
  const [tab, setTab] = useState<"people" | "courses">("people");
  const [q, setQ] = useState("");
  const [roleType, setRoleType] = useState<string>("all");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of members) m.set(u.roleType, (m.get(u.roleType) ?? 0) + 1);
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((u) => {
      if (roleType !== "all" && u.roleType !== roleType) return false;
      if (needle && !`${u.name} ${u.email} ${u.roleName} ${u.subPositions.join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [members, q, roleType]);

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("people")} className={pill(tab === "people")}>People ({members.length})</button>
        <button onClick={() => setTab("courses")} className={pill(tab === "courses")}>Course performance ({courses.length})</button>
      </div>

      {tab === "people" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className="gt-input max-w-xs" placeholder="🔍 Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={() => setRoleType("all")} className={pill(roleType === "all")}>
              Everyone
              <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === "all" ? "bg-white/20" : "bg-[var(--card)]"}`}>{members.length}</span>
            </button>
            {ROLE_ORDER.filter((r) => (countByRole.get(r) ?? 0) > 0).map((r) => (
              <button key={r} onClick={() => setRoleType(r)} className={pill(roleType === r)}>
                {ROLE_LABEL[r] ?? r}
                <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${roleType === r ? "bg-white/20" : "bg-[var(--card)]"}`}>{countByRole.get(r)}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="🔍" title="No people match" hint="Try a different search or role filter." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setOpenUserId(u.id)}
                  className={`gt-card group flex flex-col p-4 text-left transition hover:border-picton/50 ${u.active ? "" : "opacity-70"}`}
                  title="View full profile"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold transition group-hover:text-picton">{u.name}</span>
                        {!u.active && <span className="gt-badge shrink-0 bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
                      </div>
                      <div className="truncate text-xs text-[var(--muted)]">{u.email}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-1 flex-wrap content-start gap-1.5">
                    <RoleChip type={u.roleType} label={u.roleName} />
                    {u.roleType === "TRAINEE" && (u.isTrained
                      ? <span className="gt-badge bg-mint/15 text-mint">🏅 Trained</span>
                      : <span className="gt-badge bg-gold/15 text-gold">In training</span>)}
                    {u.subPositions.slice(0, 2).map((sp) => <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>)}
                    {u.subPositions.length > 2 && <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{u.subPositions.length - 2}</span>}
                  </div>
                  {u.roleType === "TRAINEE" && u.courses > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>{u.completedCourses}/{u.courses} courses done</span>
                        <span className="font-bold text-[var(--fg)]">{u.avgPercent}%</span>
                      </div>
                      <div className="mt-1"><ProgressBar percent={u.avgPercent} /></div>
                    </div>
                  )}
                  <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-xs text-[var(--muted)]">
                    {u.lastLoginAt ? `Seen ${timeAgo(new Date(u.lastLoginAt))}` : <span className="gt-badge bg-gold/15 text-gold">Never logged in</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "courses" && (
        courses.length === 0 ? (
          <EmptyState icon="📊" title="No enrolment data" hint="Numbers appear once this centre's trainees are enrolled in courses." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => {
              const completionRate = c.enrolled ? Math.round((c.completed / c.enrolled) * 100) : 0;
              return (
                <div key={c.id} className="gt-card flex flex-col p-5 transition hover:border-picton/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-picton/15 text-xl text-picton">📚</div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold tracking-tight ${completionRate >= 70 ? "text-mint" : completionRate >= 40 ? "text-gold" : "text-orange"}`}>{completionRate}%</div>
                      <div className="text-xs text-[var(--muted)]">completion</div>
                    </div>
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    <div className="truncate text-lg font-bold tracking-tight" title={c.title}>{c.title}</div>
                    <div className="mt-2"><ProgressBar percent={c.avgPercent} /></div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{c.avgPercent}% average lesson progress</div>
                  </div>
                  <div className="mt-4 flex gap-5 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xl font-bold leading-tight">{c.enrolled}</div>
                      <div className="text-xs text-[var(--muted)]">enrolled</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold leading-tight">{c.completed}</div>
                      <div className="text-xs text-[var(--muted)]">completed</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
