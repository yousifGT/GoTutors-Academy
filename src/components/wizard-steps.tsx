const STEPS = ["Details", "Curriculum", "Review & publish"] as const;

/** Step indicator for the demo course-creation wizard. */
export function WizardSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-[var(--border)]" />}
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                state === "active"
                  ? "bg-navy text-white"
                  : state === "done"
                    ? "bg-mint text-white"
                    : "bg-[var(--soft)] text-[var(--muted)]"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "active" ? "font-semibold" : "text-[var(--muted)]"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
