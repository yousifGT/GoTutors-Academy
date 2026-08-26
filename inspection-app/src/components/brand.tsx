export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span style={{ color: "#1C1960" }}>Go</span>
      <span style={{ color: "#57B9EA" }}>Tutors</span>
    </span>
  );
}

// Verdict colours live with the report, so the screen and the PDF share one table.
export { VERDICT_COLOR } from "@/lib/report";
