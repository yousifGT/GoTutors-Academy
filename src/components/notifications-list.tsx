"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type N = { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };

export function NotificationsList({ initial }: { initial: N[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function markAllRead() {
    start(async () => {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
      router.refresh();
    });
  }
  function markRead(id: string) {
    start(async () => {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ read: true }),
      });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button disabled={pending} onClick={markAllRead} className="gt-btn-ghost text-sm">Mark all read</button>
      </div>
      <div className="gt-card divide-y divide-[var(--border)]">
        {initial.map((n) => (
          <div key={n.id} className={`p-4 flex items-start justify-between gap-4 ${n.read ? "opacity-70" : ""}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className={`gt-badge ${typeColor(n.type)}`}>{label(n.type)}</span>
                {!n.read && <span className="h-2 w-2 rounded-full bg-orange" />}
              </div>
              <div className="mt-2 font-medium">{n.title}</div>
              {n.body && <div className="text-sm text-[var(--muted)] mt-1">{n.body}</div>}
              <div className="text-xs text-[var(--muted)] mt-1">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-2">
              {n.link && <Link href={n.link} className="gt-btn-accent text-sm">Open</Link>}
              {!n.read && <button onClick={() => markRead(n.id)} className="text-xs text-picton">Mark read</button>}
            </div>
          </div>
        ))}
        {initial.length === 0 && <div className="p-8 text-center text-[var(--muted)]">No notifications.</div>}
      </div>
    </div>
  );
}

function label(t: string) {
  return ({
    TRAINEE_ENROLLED: "Enrolled",
    TRAINEE_PASSED: "Passed",
    TRAINEE_FAILED: "Failed",
    RETRY_UNLOCK_NEEDED: "Retry unlock",
  } as Record<string, string>)[t] ?? t;
}
function typeColor(t: string) {
  return ({
    TRAINEE_ENROLLED: "bg-picton/20 text-picton",
    TRAINEE_PASSED: "bg-mint/20 text-mint",
    TRAINEE_FAILED: "bg-orange/20 text-orange",
    RETRY_UNLOCK_NEEDED: "bg-magenta/20 text-magenta",
  } as Record<string, string>)[t] ?? "bg-[var(--soft)]";
}
