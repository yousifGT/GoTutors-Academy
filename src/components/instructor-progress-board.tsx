"use client";
import { useMemo, useState } from "react";
import { Avatar, EmptyState, StatCard } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { UserOverviewModal } from "@/components/user-overview-modal";
import { timeAgo } from "@/lib/utils";

export type ProgressRow = {
  id: string;
  userId: string;
  traineeName: string;
  traineeEmail: string;
  courseId: string;
  courseTitle: string;
  percent: number;
  done: number;
  total: number;
  completed: boolean;
  enrolledAt: string; // ISO
};

type Status = "all" | "not-started" | "in-progress" | "completed";

const STATUS_META: Record<Exclude<Status, "all">, { label: string; chip: string }> = {
  "not-started": { label: "Not started", chip: "bg-orange/15 text-orange" },
  "in-progress": { label: "In progress", chip: "bg-gold/15 text-gold" },
  completed: { label: "Completed", chip: "bg-mint/15 text-mint" },
};

function rowStatus(r: ProgressRow): Exclude<Status, "all"> {
  if (r.completed) return "completed";
  if (r.percent === 0) return "not-started";
  return "in-progress";
}

export function InstructorProgressBoard({ rows, courses }: { rows: ProgressRow[]; courses: { id: string; title: string }[] }) {
  const [courseId, setCourseId] = useState<string>("all");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const trainees = new Set(rows.map((r) => r.traineeEmail)).size;
    const completed = rows.filter((r) => rowStatus(r) === "completed").length;
    const stuck = rows.filter((r) => rowStatus(r) === "not-started").length;
    const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.percent, 0) / rows.length) : 0;
    return { trainees, completed, stuck, avg };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (courseId !== "all" && r.courseId !== courseId) return false;
      if (status !== "all" && rowStatus(r) !== status) return false;
      if (needle && !`${r.traineeName} ${r.traineeEmail} ${r.courseTitle}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, courseId, status, q]);

  const countByCourse = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.courseId, (m.get(r.courseId) ?? 0) + 1);
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trainees" value={stats.trainees} icon="👥" tone="navy" />
        <StatCard label="Avg progress" value={`${stats.avg}%`} icon="📈" tone="picton" />
        <StatCard label="Completed" value={stats.completed} icon="🏆" tone="mint" />
        <StatCard label="Not started" value={stats.stuck} icon="⏰" tone="orange" hint="Enrolled but haven't begun — worth a nudge" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="gt-input max-w-xs"
          placeholder="🔍 Search trainee or course…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {(["all", "not-started", "in-progress", "completed"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${status === s ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
            >
              {s === "all" ? "All statuses" : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCourseId("all")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${courseId === "all" ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
        >
          All courses
          <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${courseId === "all" ? "bg-white/20" : "bg-[var(--card)]"}`}>{rows.length}</span>
        </button>
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => setCourseId(c.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${courseId === c.id ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
          >
            {c.title}
            <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${courseId === c.id ? "bg-white/20" : "bg-[var(--card)]"}`}>{countByCourse.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No matches" hint="Try a different search, status or course filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const s = rowStatus(r);
            return (
              <div
                key={r.id}
                className={`gt-card flex flex-col p-5 transition hover:border-picton/50 ${s === "not-started" ? "border-l-4 border-l-orange/50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenUserId(r.userId)}
                    className="flex min-w-0 items-center gap-3 text-left transition hover:opacity-80"
                    title="View trainee profile"
                  >
                    <Avatar name={r.traineeName} />
                    <div className="min-w-0">
                      <div className="truncate font-bold transition hover:text-picton">{r.traineeName}</div>
                      <div className="truncate text-xs text-[var(--muted)]">{r.traineeEmail}</div>
                    </div>
                  </button>
                  <span className={`gt-badge shrink-0 ${STATUS_META[s].chip}`}>{STATUS_META[s].label}</span>
                </div>
                <div className="mt-3 flex-1">
                  <span className="gt-badge bg-picton/15 text-picton">📚 {r.courseTitle}</span>
                </div>
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-[var(--muted)]">
                      {r.total > 0 ? `${r.done}/${r.total} lessons` : "No lessons yet"}
                    </span>
                    <span className="font-bold">{r.percent}%</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar percent={r.percent} /></div>
                  <div className="mt-2 text-xs text-[var(--muted)]">Enrolled {timeAgo(new Date(r.enrolledAt))}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
