import Link from "next/link";
import { ReactNode } from "react";
import { timeAgo } from "@/lib/utils";

/* Shared page building blocks so every screen shares one visual language. */

const tones = {
  navy: "bg-navy/10 text-navy dark:bg-ice/10 dark:text-ice",
  picton: "bg-picton/15 text-picton",
  mint: "bg-mint/15 text-mint",
  gold: "bg-gold/15 text-gold",
  orange: "bg-orange/15 text-orange",
  magenta: "bg-magenta/15 text-magenta",
} as const;
export type StatTone = keyof typeof tones;

export function StatCard({
  label,
  value,
  icon,
  tone = "picton",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: StatTone;
  hint?: string;
}) {
  return (
    <div className="gt-card flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
        <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
      </div>
      {icon && (
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${tones[tone]}`}>
          {icon}
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div>
      {backHref && (
        <Link href={backHref} className="text-sm text-picton">
          ← {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** One-row compact stat strip — reference numbers without eating the page. */
export function StatStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="gt-card flex flex-wrap divide-x divide-[var(--border)] p-0">
      {items.map((s) => (
        <div key={s.label} className="min-w-[8rem] flex-1 px-5 py-3">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{s.label}</div>
          <div className="text-xl font-bold">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export type AttentionItem = {
  icon: string;
  text: string;
  detail?: string;
  href: string;
  action: string;
  tone: "orange" | "gold" | "picton";
};

const attentionTone = {
  orange: "border-orange/40",
  gold: "border-gold/40",
  picton: "border-picton/40",
} as const;

/** Prioritised "needs attention" list with jump-to-fix actions. */
export function AttentionPanel({
  items,
  emptyTitle = "Nothing needs you",
  emptyHint = "All clear. Enjoy it.",
}: {
  items: AttentionItem[];
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) return <EmptyState icon="✅" title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div key={i} className={`gt-card flex items-center gap-3 border-l-4 p-4 ${attentionTone[a.tone]}`}>
          <span className="text-xl">{a.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{a.text}</div>
            {a.detail && <div className="text-xs text-[var(--muted)]">{a.detail}</div>}
          </div>
          <Link href={a.href} className="gt-btn-ghost shrink-0 text-xs">{a.action}</Link>
        </div>
      ))}
    </div>
  );
}

export type FeedItem = { at: Date; icon: string; text: string };

/** Newest-first activity feed with relative timestamps. */
export function ActivityFeed({
  items,
  emptyHint = "Activity shows up here.",
}: {
  items: FeedItem[];
  emptyHint?: string;
}) {
  if (items.length === 0) return <EmptyState icon="🌙" title="No activity yet" hint={emptyHint} />;
  return (
    <div className="gt-card divide-y divide-[var(--border)] p-0">
      {items.map((f, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="text-lg leading-none">{f.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm">{f.text}</div>
            <div className="text-xs text-[var(--muted)]">{timeAgo(f.at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "🗂️",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="gt-card p-10 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="mt-3 font-semibold">{title}</div>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
