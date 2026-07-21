"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, EmptyState } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";
import { UserOverviewModal } from "@/components/user-overview-modal";
import { timeAgo } from "@/lib/utils";

export type PromoteCandidate = {
  id: string;
  name: string;
  email: string;
  trainedFields: string[];
  otherFields: { name: string; done: number; total: number }[];
};

export type LockedItem = {
  userId: string;
  quizId: string;
  name: string;
  email: string;
  lessonTitle: string;
  courseTitle: string;
};

export type GhostItem = {
  id: string;
  name: string;
  email: string;
  createdAt: string; // ISO
};

export type NoPositionItem = {
  id: string;
  name: string;
  email: string;
  createdAt: string; // ISO
};

export type StalledItem = {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string; // ISO
  unfinished: number;
  avgPercent: number;
};

function SectionHeader({ icon, bubble, title, count, hint }: { icon: string; bubble: string; title: string; count: number; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${bubble}`}>{icon}</div>
      <div className="min-w-0">
        <h3 className="text-lg font-bold leading-tight">
          {title} <span className="ml-1 rounded-full bg-[var(--soft)] px-2 py-0.5 text-xs font-bold text-[var(--muted)]">{count}</span>
        </h3>
        <p className="text-xs text-[var(--muted)]">{hint}</p>
      </div>
    </div>
  );
}

function PersonHead({ name, email, onView }: { name: string; email: string; onView: () => void }) {
  return (
    <button type="button" onClick={onView} className="flex min-w-0 items-center gap-3 text-left" title="View full profile">
      <Avatar name={name} />
      <div className="min-w-0">
        <div className="truncate font-bold transition hover:text-picton">{name}</div>
        <div className="truncate text-xs text-[var(--muted)]">{email}</div>
      </div>
    </button>
  );
}

export function CentreReviewBoard({
  promote,
  locked,
  ghosts,
  noPosition,
  stalled,
}: {
  promote: PromoteCandidate[];
  locked: LockedItem[];
  ghosts: GhostItem[];
  noPosition: NoPositionItem[];
  stalled: StalledItem[];
}) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlocking, setUnlocking] = useState<string | null>(null);

  async function unlock(item: LockedItem) {
    const key = `${item.userId}:${item.quizId}`;
    setUnlocking(key);
    const res = await fetch("/api/quiz/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: item.userId, quizId: item.quizId }),
    });
    setUnlocking(null);
    if (res.ok) setUnlocked((s) => new Set(s).add(key));
    else alert((await res.json().catch(() => ({})))?.error ?? "Unlock failed");
  }

  const total = promote.length + locked.length + ghosts.length + noPosition.length + stalled.length;
  if (total === 0) {
    return (
      <EmptyState
        icon="🎉"
        title="Nothing to review"
        hint="No promotions waiting, nobody locked out, everyone signed in, positioned and moving. Enjoy the quiet."
      />
    );
  }

  return (
    <div className="space-y-8">
      {promote.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon="🏅" bubble="bg-mint/15 text-mint" title="Ready to promote" count={promote.length} hint="Finished every course in a field — one click from becoming its tutor." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {promote.map((p) => (
              <div key={p.id} className="gt-card flex flex-col border-l-4 border-l-mint/60 p-4 transition hover:border-picton/50">
                <PersonHead name={p.name} email={p.email} onView={() => setOpenUserId(p.id)} />
                <div className="mt-2.5 flex flex-1 flex-wrap content-start gap-1.5">
                  {p.trainedFields.map((f) => <span key={f} className="gt-badge bg-mint/15 text-mint">🏅 {f}</span>)}
                  {p.otherFields.map((f) => (
                    <span key={f.name} className="gt-badge bg-[var(--soft)] text-[var(--muted)]">{f.name} {f.done}/{f.total}</span>
                  ))}
                </div>
                <div className="mt-3 border-t border-[var(--border)] pt-2.5">
                  <button onClick={() => setOpenUserId(p.id)} className="gt-btn-primary w-full text-xs">⬆ Review & promote</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {locked.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon="🔒" bubble="bg-orange/15 text-orange" title="Locked out of a quiz" count={locked.length} hint="Out of attempts — unlock to give them a fresh set of tries." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {locked.map((l) => {
              const key = `${l.userId}:${l.quizId}`;
              const done = unlocked.has(key);
              return (
                <div key={key} className={`gt-card flex flex-col border-l-4 p-4 transition hover:border-picton/50 ${done ? "border-l-mint/60 opacity-70" : "border-l-orange/60"}`}>
                  <PersonHead name={l.name} email={l.email} onView={() => setOpenUserId(l.userId)} />
                  <div className="mt-2.5 flex-1 text-sm">
                    <span className="gt-badge bg-orange/15 text-orange">📝 {l.lessonTitle}</span>
                    <div className="mt-1 text-xs text-[var(--muted)]">in {l.courseTitle}</div>
                  </div>
                  <div className="mt-3 border-t border-[var(--border)] pt-2.5">
                    {done ? (
                      <div className="text-center text-sm font-semibold text-mint">✓ Unlocked — fresh tries granted</div>
                    ) : (
                      <button onClick={() => unlock(l)} disabled={unlocking === key} className="gt-btn-primary w-full text-xs">
                        {unlocking === key ? "Unlocking…" : "🔓 Unlock retries"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {ghosts.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon="👻" bubble="bg-gold/15 text-gold" title="Never signed in" count={ghosts.length} hint="Created 3+ days ago and never seen — they may need their credentials re-sent." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ghosts.map((g) => (
              <div key={g.id} className="gt-card flex flex-col border-l-4 border-l-gold/60 p-4 transition hover:border-picton/50">
                <PersonHead name={g.name} email={g.email} onView={() => setOpenUserId(g.id)} />
                <div className="mt-2.5 flex-1 text-xs text-[var(--muted)]">
                  Account created {timeAgo(new Date(g.createdAt))} — no sign-in since.
                </div>
                <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-2.5">
                  <Link href={`/centre/trainees/${g.id}/edit`} className="gt-btn-primary flex-1 text-center text-xs">🔑 Reset password</Link>
                  <button onClick={() => setOpenUserId(g.id)} className="gt-btn-ghost text-xs">View</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {noPosition.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon="🧩" bubble="bg-gold/15 text-gold" title="No sub-position" count={noPosition.length} hint="Without a sub-position they receive no auto-enrolled courses at all." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {noPosition.map((n) => (
              <div key={n.id} className="gt-card flex flex-col border-l-4 border-l-gold/60 p-4 transition hover:border-picton/50">
                <PersonHead name={n.name} email={n.email} onView={() => setOpenUserId(n.id)} />
                <div className="mt-2.5 flex-1 text-xs text-[var(--muted)]">
                  Joined {timeAgo(new Date(n.createdAt))} — not training as anything yet.
                </div>
                <div className="mt-3 border-t border-[var(--border)] pt-2.5">
                  <Link href={`/centre/trainees/${n.id}/edit`} className="gt-btn-primary block text-center text-xs">🧩 Assign a position</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stalled.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon="🐌" bubble="bg-picton/15 text-picton" title="Stalled mid-training" count={stalled.length} hint="Unfinished courses and no sign-in for 14+ days — worth a nudge." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stalled.map((s) => (
              <div key={s.id} className="gt-card flex flex-col border-l-4 border-l-picton/60 p-4 transition hover:border-picton/50">
                <PersonHead name={s.name} email={s.email} onView={() => setOpenUserId(s.id)} />
                <div className="mt-2.5 flex-1">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>{s.unfinished} unfinished course{s.unfinished === 1 ? "" : "s"}</span>
                    <span className="font-bold text-[var(--fg)]">{s.avgPercent}%</span>
                  </div>
                  <div className="mt-1"><ProgressBar percent={s.avgPercent} /></div>
                  <div className="mt-1.5 text-xs text-[var(--muted)]">Last seen {timeAgo(new Date(s.lastLoginAt))}</div>
                </div>
                <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-2.5">
                  <Link href={`/centre/trainees/${s.id}`} className="gt-btn-primary flex-1 text-center text-xs">📈 Full progress</Link>
                  <button onClick={() => setOpenUserId(s.id)} className="gt-btn-ghost text-xs">View</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {openUserId && <UserOverviewModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </div>
  );
}
