export function Logo({
  className = "",
  variant = "default",
}: {
  className?: string;
  /** "onDark" renders correctly on the navy sidebar / hero panels in both themes. */
  variant?: "default" | "onDark";
}) {
  const onDark = variant === "onDark";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl font-bold ${
          onDark ? "bg-white text-navy" : "bg-navy text-white"
        }`}
      >
        G
      </div>
      <div className="leading-tight">
        <div className={`font-bold ${onDark ? "text-white" : "text-navy dark:text-ice"}`}>GoTutors</div>
        <div className="text-[10px] uppercase tracking-widest text-picton">Academy</div>
      </div>
    </div>
  );
}
