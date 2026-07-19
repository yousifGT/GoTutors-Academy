import Link from "next/link";
import { ReactNode } from "react";

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
