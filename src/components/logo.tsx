export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-white font-bold">G</div>
      <div className="leading-tight">
        <div className="font-bold text-navy dark:text-ice">GoTutors</div>
        <div className="text-[10px] uppercase tracking-widest text-picton">Academy</div>
      </div>
    </div>
  );
}
