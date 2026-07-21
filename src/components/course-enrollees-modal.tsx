"use client";
import { useEffect } from "react";
import { Avatar, RoleChip } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";

export type CourseEnrollee = {
  userId: string;
  name: string;
  email: string;
  roleName: string;
  roleType: string;
  subPositions: string[];
  percent: number;
  completed: boolean;
};

const ROLE_ORDER = ["TRAINEE", "INSTRUCTOR", "CENTRE_ADMIN", "SUPER_ADMIN"];
const GROUP_LABEL: Record<string, string> = {
  TRAINEE: "Trainees",
  INSTRUCTOR: "Instructors",
  CENTRE_ADMIN: "Centre Admins",
  SUPER_ADMIN: "Super Admins",
};

/** Who is on a course, grouped by role, with each person's progress. */
export function CourseEnrolleesModal({
  title,
  enrollees,
  onClose,
  onOpenUser,
}: {
  title: string;
  enrollees: CourseEnrollee[];
  onClose: () => void;
  onOpenUser: (userId: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const completed = enrollees.filter((e) => e.completed).length;
  const avg = enrollees.length ? Math.round(enrollees.reduce((n, e) => n + e.percent, 0) / enrollees.length) : 0;
  const groups = ROLE_ORDER.map((type) => ({
    type,
    people: enrollees.filter((e) => e.roleType === type).sort((a, b) => b.percent - a.percent),
  })).filter((g) => g.people.length > 0);

  return (
    <div
      className="gt-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-navy/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gt-modal-panel gt-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero */}
        <div className="relative shrink-0 bg-gradient-to-br from-navy via-royal to-picton p-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm text-white transition hover:bg-white/25"
            aria-label="Close"
          >
            ✕
          </button>
          <div className="flex items-center gap-4 pr-10">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl">📚</div>
            <div className="min-w-0">
              <div className="truncate text-2xl font-bold tracking-tight">{title}</div>
              <div className="text-sm text-ice/80">Everyone enrolled, grouped by role</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="text-xl font-bold leading-tight text-white">{enrollees.length}</div>
              <div className="text-[11px] uppercase tracking-wide text-ice/70">Enrolled</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="text-xl font-bold leading-tight text-white">{completed}</div>
              <div className="text-[11px] uppercase tracking-wide text-ice/70">Completed</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="text-xl font-bold leading-tight text-white">{avg}%</div>
              <div className="text-[11px] uppercase tracking-wide text-ice/70">Avg progress</div>
            </div>
          </div>
        </div>

        {/* Grouped roster */}
        <div className="min-h-[10rem] flex-1 space-y-4 overflow-y-auto p-5">
          {groups.length === 0 && (
            <div className="py-8 text-center">
              <div className="text-4xl">📭</div>
              <p className="mt-3 text-sm text-[var(--muted)]">Nobody is enrolled in this course yet.</p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.type}>
              <div className="flex items-center gap-2">
                <RoleChip type={g.type} label={GROUP_LABEL[g.type]} />
                <span className="text-xs font-bold text-[var(--muted)]">{g.people.length}</span>
              </div>
              <div className="mt-2 space-y-2">
                {g.people.map((p) => (
                  <div key={p.userId} className="rounded-xl border border-[var(--border)] p-3 transition hover:border-picton/50">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenUser(p.userId)}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                        title="View full profile"
                      >
                        <Avatar name={p.name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold transition hover:text-picton">{p.name}</div>
                          <div className="truncate text-xs text-[var(--muted)]">{p.email}</div>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {p.subPositions.slice(0, 2).map((sp) => (
                          <span key={sp} className="gt-badge hidden bg-magenta/15 text-magenta sm:inline-flex">{sp}</span>
                        ))}
                        {p.completed
                          ? <span className="gt-badge bg-mint/15 text-mint">Completed</span>
                          : p.percent === 0
                            ? <span className="gt-badge bg-orange/15 text-orange">Not started</span>
                            : <span className="gt-badge bg-gold/15 text-gold">In progress</span>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar percent={p.percent} />
                      <span className="w-10 shrink-0 text-right text-xs font-bold">{p.percent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
