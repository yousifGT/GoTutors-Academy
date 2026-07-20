"use client";
import { useEffect, useState } from "react";
import { Avatar, RoleChip } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { formatDate, timeAgo } from "@/lib/utils";

type Overview = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    roleName: string;
    roleType: string;
    position: string | null;
    subPositions: string[];
    isTrained: boolean;
    active: boolean;
    centreName: string | null;
    supervisorName: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  enrollments: { courseId: string; title: string; percent: number; done: number; total: number; completed: boolean; enrolledAt: string }[];
  certificates: { id: string; courseTitle: string; courseVersion: number | null; serial: string; issuedAt: string }[];
  authoredCourses: { id: string; title: string; published: boolean; enrolments: number }[];
};

type Tab = "profile" | "courses" | "certificates";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{children}</span>
    </div>
  );
}

export function UserOverviewModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/overview`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Failed to load");
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const u = data?.user;
  const isTrainee = u?.roleType === "TRAINEE";
  const authors = (data?.authoredCourses.length ?? 0) > 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "profile", label: "Profile" },
    { id: "courses", label: authors && !isTrainee ? "Courses authored" : "Courses", count: authors && !isTrainee ? data?.authoredCourses.length : data?.enrollments.length },
    { id: "certificates", label: "Certificates", count: data?.certificates.length },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gt-card flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-[var(--border)] p-5">
          {u ? (
            <>
              <Avatar name={u.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold tracking-tight">{u.name}</div>
                <div className="truncate text-sm text-[var(--muted)]">{u.email}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RoleChip type={u.roleType} label={u.roleName} />
                  {isTrainee && (u.isTrained
                    ? <span className="gt-badge bg-mint/15 text-mint">🏅 Trained</span>
                    : <span className="gt-badge bg-gold/15 text-gold">In training</span>)}
                  {!u.active && <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">Deactivated</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 py-2 text-sm text-[var(--muted)]">{error ?? "Loading…"}</div>
          )}
          <button onClick={onClose} className="gt-btn-ghost shrink-0 px-2.5 text-sm" aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)] px-5 py-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === t.id ? "bg-navy text-white shadow-soft" : "bg-[var(--soft)] hover:opacity-80"}`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs font-bold ${tab === t.id ? "bg-white/20" : "bg-[var(--card)]"}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-[14rem] flex-1 overflow-y-auto p-5">
          {!data && !error && <div className="py-10 text-center text-sm text-[var(--muted)]">Loading…</div>}
          {error && <div className="py-10 text-center text-sm text-orange">⚠ {error}</div>}

          {u && tab === "profile" && (
            <div className="divide-y divide-[var(--border)]">
              <InfoRow label="Email">{u.email}</InfoRow>
              <InfoRow label="Phone">{u.phone || <span className="text-[var(--muted)]">—</span>}</InfoRow>
              {isTrainee ? (
                <InfoRow label="Sub-positions">
                  {u.subPositions.length > 0 ? (
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {u.subPositions.map((sp) => <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>)}
                    </span>
                  ) : <span className="text-[var(--muted)]">None yet</span>}
                </InfoRow>
              ) : (
                <InfoRow label="Position">{u.position || <span className="text-[var(--muted)]">—</span>}</InfoRow>
              )}
              <InfoRow label="Centre">{u.centreName ?? <span className="text-[var(--muted)]">—</span>}</InfoRow>
              <InfoRow label="Supervisor">{u.supervisorName ?? <span className="text-[var(--muted)]">—</span>}</InfoRow>
              <InfoRow label="Last login">{u.lastLoginAt ? timeAgo(new Date(u.lastLoginAt)) : <span className="gt-badge bg-gold/15 text-gold">Never</span>}</InfoRow>
              <InfoRow label="Joined">{formatDate(new Date(u.createdAt))}</InfoRow>
            </div>
          )}

          {data && tab === "courses" && (
            authors && !isTrainee ? (
              data.authoredCourses.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--muted)]">No courses authored yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.authoredCourses.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{c.title}</div>
                        <div className="text-xs text-[var(--muted)]">{c.enrolments} enrolment{c.enrolments === 1 ? "" : "s"}</div>
                      </div>
                      <span className={`gt-badge shrink-0 ${c.published ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                        {c.published ? "Published" : "Draft"}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : data.enrollments.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">Not enrolled in any courses yet.</p>
            ) : (
              <div className="space-y-2.5">
                {data.enrollments.map((e) => (
                  <div key={e.courseId} className="rounded-xl border border-[var(--border)] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-semibold">{e.title}</div>
                      {e.completed
                        ? <span className="gt-badge shrink-0 bg-mint/15 text-mint">Completed</span>
                        : e.percent === 0
                          ? <span className="gt-badge shrink-0 bg-orange/15 text-orange">Not started</span>
                          : <span className="gt-badge shrink-0 bg-gold/15 text-gold">In progress</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar percent={e.percent} />
                      <span className="w-10 shrink-0 text-right text-xs font-bold">{e.percent}%</span>
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-[var(--muted)]">
                      <span>{e.total > 0 ? `${e.done}/${e.total} lessons` : "No lessons yet"}</span>
                      <span>Enrolled {timeAgo(new Date(e.enrolledAt))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {data && tab === "certificates" && (
            data.certificates.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">No certificates earned yet.</p>
            ) : (
              <div className="space-y-2.5">
                {data.certificates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3.5">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-lg text-gold">📜</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {c.courseTitle}
                        {c.courseVersion ? <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">v{c.courseVersion}</span> : null}
                      </div>
                      <div className="text-xs text-[var(--muted)]">Issued {formatDate(new Date(c.issuedAt))} · {c.serial}</div>
                    </div>
                    <a href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost shrink-0 text-xs">Download</a>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
