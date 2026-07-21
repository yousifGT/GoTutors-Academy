"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/page-ui";
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
    teacherPositions: string[];
    isTrained: boolean;
    active: boolean;
    centreName: string | null;
    supervisorName: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  fieldStatus: { name: string; total: number; done: number; trained: boolean }[];
  canPromote: boolean;
  enrollments: { courseId: string; title: string; percent: number; done: number; total: number; completed: boolean; enrolledAt: string }[];
  certificates: { id: string; courseTitle: string; courseVersion: number | null; serial: string; issuedAt: string }[];
  authoredCourses: { id: string; title: string; published: boolean; enrolments: number }[];
};

type Tab = "profile" | "courses" | "certificates";

const ROLE_META: Record<string, { icon: string; gradient: string }> = {
  SUPER_ADMIN: { icon: "🛡️", gradient: "from-navy via-royal to-magenta" },
  CENTRE_ADMIN: { icon: "🏫", gradient: "from-navy via-royal to-gold" },
  INSTRUCTOR: { icon: "🧑‍🏫", gradient: "from-navy via-royal to-picton" },
  TRAINEE: { icon: "🎓", gradient: "from-navy via-royal to-picton" },
};

function HeroStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
      <div className="text-xl font-bold leading-tight text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ice/70">{label}</div>
    </div>
  );
}

function InfoTile({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--soft)]/40 p-3 ${wide ? "col-span-2" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

export function UserOverviewModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/users/${userId}/overview`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Something went wrong loading this profile.");
        return r.json();
      });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [load]);

  async function promote(field: string) {
    if (!data) return;
    if (!confirm(`Promote ${data.user.name} to ${field}?\n\nThey move up to the Tutor role — one rung above trainee, without instructor/course-authoring access. Training in their other fields continues unchanged, and all enrolments and certificates are kept.`)) return;
    setPromoting(true);
    setPromoteMsg(null);
    const res = await fetch(`/api/users/${userId}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subPosition: field }),
    });
    const body = await res.json().catch(() => ({}));
    setPromoting(false);
    if (!res.ok) return setPromoteMsg({ kind: "err", text: body.error ?? "Promotion failed" });
    setPromoteMsg({ kind: "ok", text: `Promoted to ${field} 🎉` });
    load().then(setData).catch(() => {});
    router.refresh();
  }

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
  const showAuthored = !isTrainee && (data?.authoredCourses.length ?? 0) > 0;
  const meta = ROLE_META[u?.roleType ?? "TRAINEE"] ?? ROLE_META.TRAINEE;
  const avgProgress = data && data.enrollments.length
    ? Math.round(data.enrollments.reduce((n, e) => n + e.percent, 0) / data.enrollments.length)
    : 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "profile", label: "Profile" },
    { id: "courses", label: showAuthored ? "Courses authored" : "Courses", count: showAuthored ? data?.authoredCourses.length : data?.enrollments.length },
    { id: "certificates", label: "Certificates", count: data?.certificates.length },
  ];

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
        {/* Hero header */}
        <div className={`relative shrink-0 bg-gradient-to-br ${meta.gradient} p-6 text-white`}>
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-cyan/20 blur-3xl" />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm text-white transition hover:bg-white/25"
            aria-label="Close"
          >
            ✕
          </button>

          {u ? (
            <>
              <div className="flex items-center gap-4">
                <div className="rounded-full ring-4 ring-white/25">
                  <Avatar name={u.name} size="xl" />
                </div>
                <div className="min-w-0 flex-1 pr-10">
                  <div className="truncate text-2xl font-bold tracking-tight">{u.name}</div>
                  <div className="truncate text-sm text-ice/80">{u.email}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="gt-badge bg-white/15 text-white">{meta.icon} {u.roleName}</span>
                    {u.teacherPositions.map((tp) => (
                      <span key={tp} className="gt-badge bg-picton/30 text-white">🎓 {tp}</span>
                    ))}
                    {isTrainee && (u.isTrained
                      ? <span className="gt-badge bg-mint/25 text-white">🏅 Trained</span>
                      : <span className="gt-badge bg-gold/25 text-white">In training</span>)}
                    {u.centreName && <span className="gt-badge bg-white/15 text-white">📍 {u.centreName}</span>}
                    {!u.active && <span className="gt-badge bg-orange/30 text-white">Deactivated</span>}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {showAuthored ? (
                  <>
                    <HeroStat value={data!.authoredCourses.length} label="Courses built" />
                    <HeroStat value={data!.authoredCourses.filter((c) => c.published).length} label="Published" />
                    <HeroStat value={data!.authoredCourses.reduce((n, c) => n + c.enrolments, 0)} label="Enrolments" />
                  </>
                ) : (
                  <>
                    <HeroStat value={data!.enrollments.length} label="Courses" />
                    <HeroStat value={`${avgProgress}%`} label="Avg progress" />
                    <HeroStat value={data!.certificates.length} label="Certificates" />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              {error ? (
                <div className="py-4">
                  <div className="text-lg font-bold">Can&apos;t open this profile</div>
                  <div className="mt-1 text-sm text-ice/80">{error}</div>
                </div>
              ) : (
                <>
                  <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-white/20" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded bg-white/20" />
                    <div className="h-3.5 w-56 animate-pulse rounded bg-white/15" />
                    <div className="h-5 w-32 animate-pulse rounded-full bg-white/10" />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        {!error && (
          <div className="flex shrink-0 gap-2 border-b border-[var(--border)] px-5 py-3">
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
        )}

        {/* Body */}
        <div className="min-h-[12rem] flex-1 overflow-y-auto p-5">
          {!data && !error && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--soft)]/60" />)}
            </div>
          )}
          {error && (
            <div className="py-8 text-center">
              <div className="text-4xl">🔒</div>
              <p className="mt-3 text-sm text-[var(--muted)]">{error}</p>
            </div>
          )}

          {u && tab === "profile" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <InfoTile label="📧 Email" wide>{u.email}</InfoTile>
                <InfoTile label="📞 Phone">{u.phone || <span className="text-[var(--muted)]">Not set</span>}</InfoTile>
                <InfoTile label="🏫 Centre">{u.centreName ?? <span className="text-[var(--muted)]">—</span>}</InfoTile>
                {!isTrainee && u.teacherPositions.length === 0 && (
                  <InfoTile label="💼 Position" wide>{u.position || <span className="text-[var(--muted)]">—</span>}</InfoTile>
                )}
                {u.teacherPositions.length > 0 && (
                  <InfoTile label="🎓 Tutor of" wide>
                    <span className="flex flex-wrap gap-1.5 pt-0.5">
                      {u.teacherPositions.map((tp) => <span key={tp} className="gt-badge bg-picton/15 text-picton">🎓 {tp}</span>)}
                    </span>
                  </InfoTile>
                )}
                <InfoTile label="🧑‍💼 Supervisor">{u.supervisorName ?? <span className="text-[var(--muted)]">—</span>}</InfoTile>
                <InfoTile label="🕐 Last login">
                  {u.lastLoginAt ? timeAgo(new Date(u.lastLoginAt)) : <span className="gt-badge bg-gold/15 text-gold">Never</span>}
                </InfoTile>
                <InfoTile label="📅 Joined" wide>{formatDate(new Date(u.createdAt))}</InfoTile>
              </div>

              {/* Per-field training state + promotion */}
              {data.fieldStatus.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft)]/40 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">🧩 Training fields</div>
                  <div className="mt-2 space-y-2.5">
                    {data.fieldStatus.map((f) => (
                      <div key={f.name} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="gt-badge bg-magenta/15 text-magenta">{f.name}</span>
                          {f.trained ? (
                            data.canPromote ? (
                              <button
                                onClick={() => promote(f.name)}
                                disabled={promoting}
                                className="gt-btn-primary text-xs"
                              >
                                {promoting ? "Promoting…" : `⬆ Promote to ${f.name}`}
                              </button>
                            ) : (
                              <span className="gt-badge bg-mint/15 text-mint">🏅 Trained — ready to promote</span>
                            )
                          ) : (
                            <span className="text-xs text-[var(--muted)]">
                              {f.total > 0 ? `${f.done}/${f.total} courses done` : "No courses defined yet"}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <ProgressBar percent={f.total > 0 ? Math.round((f.done / f.total) * 100) : 0} />
                          {f.trained && <span className="shrink-0 text-xs font-bold text-mint">🏅 Trained</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {promoteMsg && (
                    <p className={`mt-2 text-sm ${promoteMsg.kind === "ok" ? "text-mint" : "text-orange"}`}>
                      {promoteMsg.kind === "ok" ? "✓ " : "⚠ "}{promoteMsg.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {data && tab === "courses" && (
            showAuthored ? (
              <div className="space-y-2.5">
                {data.authoredCourses.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3.5 transition hover:border-picton/50">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-picton/15 text-lg text-picton">📚</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.title}</div>
                      <div className="text-xs text-[var(--muted)]">{c.enrolments} enrolment{c.enrolments === 1 ? "" : "s"}</div>
                    </div>
                    <span className={`gt-badge shrink-0 ${c.published ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                      {c.published ? "Published" : "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            ) : data.enrollments.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-4xl">📭</div>
                <p className="mt-3 text-sm text-[var(--muted)]">Not enrolled in any courses yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.enrollments.map((e) => (
                  <div
                    key={e.courseId}
                    className={`rounded-xl border border-[var(--border)] border-l-4 p-3.5 transition hover:border-picton/50 ${e.completed ? "border-l-mint/60" : e.percent === 0 ? "border-l-orange/60" : "border-l-gold/60"}`}
                  >
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
              <div className="py-8 text-center">
                <div className="text-4xl">📜</div>
                <p className="mt-3 text-sm text-[var(--muted)]">No certificates earned yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.certificates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 p-3.5 transition hover:border-gold/60">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-xl text-gold">🏆</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {c.courseTitle}
                        {c.courseVersion ? <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">v{c.courseVersion}</span> : null}
                      </div>
                      <div className="text-xs text-[var(--muted)]">Issued {formatDate(new Date(c.issuedAt))} · {c.serial}</div>
                    </div>
                    <a href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost shrink-0 text-xs">⬇ Download</a>
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
