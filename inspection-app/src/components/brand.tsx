export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span style={{ color: "#1C1960" }}>Go</span>
      <span style={{ color: "#57B9EA" }}>Tutors</span>
    </span>
  );
}

/** Verdict colours match inspection-core's verdictFor(), so the two never drift. */
export const VERDICT_COLOR: Record<string, string> = {
  Good: "#2f855a",
  Satisfactory: "#c07d10",
  "Needs attention": "#c0392b",
  "Serious finding": "#c0392b",
};
