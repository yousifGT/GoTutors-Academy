export function ProgressBar({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full rounded-full bg-[var(--soft)] overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-picton to-mint transition-all"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}
