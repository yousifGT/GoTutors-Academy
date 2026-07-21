"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, EmptyState, StatCard } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { UserOverviewModal } from "@/components/user-overview-modal";
import { timeAgo } from "@/lib/utils";

export type TraineeRow = {
  id: string;
  name: string;
  email: string;
  subPositions: string[];
  isTrained: boolean;
  active: boolean;
  lastLoginAt: string | null; // ISO
  enrolled: number;
  completedCourses: number;
  avgPercent: number;
  lockedQuiz: boolean;
};

type StatusFilter = "all" | "active" | "inactive" | "never" | "locked";
type TrainedFilter = "all" | "trained" | "in-training";
type SortKey = "newest" | "name" | "last-login" | "progress";

const PAGE_SIZE = 24;

export function TraineesDirectory({ rows }: { rows: TraineeRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [trained, setTrained] = useState<TrainedFilter>("all");
  const [sub, setSub] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: rows.length,
    trained: rows.filter((r) => r.isTrained).length,
    locked: rows.filter((r) => r.lockedQuiz).length,
    never: rows.filter((r) => !r.lastLoginAt).length,
  }), [rows]);

  const subPositions = useMemo(() => [...new Set(rows.flatMap((r) => r.subPositions))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (status === "active" && !r.active) return false;
      if (status === "inactive" && r.active) return false;
      if (status === "never" && r.lastLoginAt) return false;
      if (status === "locked" && !r.lockedQuiz) return false;
      if (trained === "trained" && !r.isTrained) return false;
      if (trained === "in-training" && r.isTrained) return false;
      if (sub !== "all" && !r.subPositions.includes(sub)) return false;
      if (needle && !`${r.name} ${r.email} ${r.subPositions.join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "last-login") out.sort((a, b) => (b.lastLoginAt ? Date.parse(b.lastLoginAt) : 0) - (a.lastLoginAt ? Date.parse(a.lastLoginAt) : 0));
    if (sort === "progress") out.sort((a, b) => b.avgPercent - a.avgPercent);
    // "newest" keeps the server order (createdAt desc).
    return out;
  }, [rows, q, status, trained, sub, sort]);

  useEffect(() => { setPage(1); }, [q, status, trained, sub, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainees" value={stats.total} icon="🧑‍🎓" tone="navy" />
        <StatCard label="Fully trained" value={stats.trained} icon="🏅" tone="mint" hint="Ready to review for promotion" />
        <StatCard label="Locked out" value={stats.locked} icon="🔒" tone={stats.locked > 0 ? "orange" : "mint"} hint={stats.locked > 0 ? "Out of quiz attempts" : "Nobody stuck"} />
        <StatCard label="Never logged in" value={stats.never} icon="⏰" tone={stats.never > 0 ? "gold" : "mint"} />
      </div>

      {/* Filter bar */}
      <div className="gt-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="gt-input max-w-xs"
            placeholder="🔍 Search name, email, sub-position…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="gt-input w-auto" value={sub} onChange={(e) => setSub(e.target.value)} title="Filter by sub-position">
            <option value="all">🧩 All sub-positions</option>
            {subPositions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="gt-input w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} title="Sort">
            <option value="newest">↕ Newest first</option>
            <option value="name">↕ Name A–Z</option>
            <option value="last-login">↕ Recently active</option>
            <option value="progress">↕ Most progress</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "inactive", "never", "locked"] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>
                {s === "all" ? "Any status" : s === "active" ? "Active" : s === "inactive" ? "Deactivated" : s === "never" ? "Never logged in" : "🔒 Locked quiz"}
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
          <div className="flex flex-wrap gap-2">
            {(["all", "trained", "in-training"] as TrainedFilter[]).map((t) => (
              <button key={t} onClick={() => setTrained(t)} className={pill(trained === t)}>
                {t === "all" ? "Any training" : t === "trained" ? "🏅 Trained" : "In training"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--muted)]">
          {filtered.length === rows.length
            ? `${filtered.length} trainee${filtered.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} trainees match`}
          {totalPages > 1 && ` · showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)}`}
        </span>
        {(q || status !== "all" || trained !== "all" || sub !== "all") && (
          <button
            onClick={() => { setQ(""); setStatus("all"); setTrained("all"); setSub("all"); }}
            className="gt-btn-ghost text-xs"
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No trainees match" hint="Try a different search or clear some filters." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((r) => (
            <div key={r.id} className={`gt-card group flex flex-col p-4 transition hover:border-picton/50 ${r.active ? "" : "opacity-70"} ${r.lockedQuiz ? "border-l-4 border-l-orange/60" : ""}`}>
              <button
                type="button"
                onClick={() => setOpenUserId(r.id)}
                className="flex min-w-0 items-center gap-3 text-left"
                title="View full profile"
              >
                <Avatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold transition group-hover:text-picton">{r.name}</span>
                    {!r.active && <span className="gt-badge shrink-0 bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{r.email}</div>
                </div>
              </button>

              <div className="mt-2.5 flex flex-wrap content-start gap-1.5">
                {r.isTrained
                  ? <span className="gt-badge bg-mint/15 text-mint">🏅 Trained</span>
                  : <span className="gt-badge bg-gold/15 text-gold">In training</span>}
                {r.lockedQuiz && <span className="gt-badge bg-orange/15 text-orange">🔒 Locked quiz</span>}
                {r.subPositions.slice(0, 2).map((sp) => <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>)}
                {r.subPositions.length > 2 && (
                  <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{r.subPositions.length - 2}</span>
                )}
                {r.subPositions.length === 0 && <span className="gt-badge bg-orange/15 text-orange">No sub-position</span>}
              </div>

              <div className="mt-3 flex-1">
                {r.enrolled > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>{r.completedCourses}/{r.enrolled} courses done</span>
                      <span className="font-bold text-[var(--fg)]">{r.avgPercent}%</span>
                    </div>
                    <div className="mt-1"><ProgressBar percent={r.avgPercent} /></div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--muted)]">No enrolments yet</div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5 text-xs text-[var(--muted)]">
                <Link href={`/centre/trainees/${r.id}`} className="transition hover:text-picton">Full page →</Link>
                <span className="shrink-0">
                  {r.lastLoginAt ? `Seen ${timeAgo(new Date(r.lastLoginAt))}` : <span className="gt-badge bg-gold/15 text-gold">Never logged in</span>}
                </span>
              </div>
              <div className="mt-1.5 opacity-0 transition group-hover:opacity-100">
                <TraineeRowActions userId={r.id} active={r.active} editHref={`/centre/trainees/${r.id}/edit`} />
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
