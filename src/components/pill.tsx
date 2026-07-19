"use client";
import { ReactNode } from "react";

/** Clean pill toggle (sr-only checkbox) — the app-wide multi-select pattern. */
export function Pill({
  selected,
  onToggle,
  children,
  tone = "navy",
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  tone?: "navy" | "magenta";
}) {
  const on = tone === "navy" ? "bg-navy text-white" : "bg-magenta text-white";
  return (
    <label
      className={`cursor-pointer select-none rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        selected ? `${on} shadow-soft` : "bg-[var(--soft)] text-[var(--fg)] hover:opacity-80"
      }`}
    >
      <input type="checkbox" className="sr-only" checked={selected} onChange={onToggle} />
      {selected ? "✓ " : ""}
      {children}
    </label>
  );
}
