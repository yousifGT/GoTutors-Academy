import Link from "next/link";
import type { ReactNode } from "react";

/* Shared building blocks, so every screen speaks one visual language. */

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
        <Link href={backHref} className="text-sm text-sky transition hover:underline no-print">
          ← {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "bg-sky/15 text-sky",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
        <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
      </div>
      {icon && <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${tone}`}>{icon}</div>}
    </div>
  );
}

/** An amber callout — something the reader has to act on or know about. */
export function Callout({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "coral" | "sky" }) {
  const tones = {
    amber: "border-amber/40 bg-amber/10 text-amber",
    coral: "border-coral/40 bg-coral/10 text-coral",
    sky: "border-sky/40 bg-sky/10 text-sky",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="mt-1 text-sm text-[var(--muted)]">{children}</div>}
    </div>
  );
}

/** Gradient initial avatar, used on every person row. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-sm", md: "h-10 w-10", lg: "h-12 w-12 text-lg" };
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky to-teal font-bold text-white ${sizes[size]}`}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}
