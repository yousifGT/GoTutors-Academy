import { Wordmark } from "@/components/wordmark";

/**
 * The lockup: the GoTutors wordmark with "Academy" under it.
 *
 * The wordmark alone is the company; this app is one product of it, so the
 * product name stays in the mark rather than living only in the page title.
 *
 * The colour is set here as text colour and inherited by the inline SVG, which
 * is why `onDark` needs no second asset — see `src/components/wordmark.tsx`.
 */
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
    /**
     * `items-start` is load-bearing. An inline SVG has no intrinsic pixel width,
     * so `h-8 w-auto` only sizes it from the viewBox while nothing else is
     * setting its width — and inside a `flex-col` parent (the login hero, which
     * is exactly where this first broke) the default `align-items: stretch`
     * does set it, to the full panel width. The mark then centres itself in
     * that box under `preserveAspectRatio`, drifting away from "Academy".
     */
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <Wordmark
        title="GoTutors Academy"
        className={`h-8 w-auto ${onDark ? "text-white" : "text-navy dark:text-ice"}`}
      />
      {/* Picton reads on navy and on white alike, so it needs no variant. */}
      <div className="text-[10px] font-medium uppercase leading-none tracking-[0.42em] text-picton">
        Academy
      </div>
    </div>
  );
}
