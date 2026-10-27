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
     * `items-center` centres "Academy" under the wordmark — and, like any
     * alignment other than `stretch`, it is load-bearing. An inline SVG has no
     * intrinsic pixel width, so `h-8 w-auto` only sizes it from the viewBox while
     * nothing else is setting its width — and inside a `flex-col` parent (the
     * login hero, which is exactly where this first broke) the default
     * `align-items: stretch` does set it, to the full panel width. The mark then
     * centres itself in that box under `preserveAspectRatio`, drifting away from
     * "Academy".
     *
     * `w-fit` keeps the lockup exactly as wide as the wordmark. `inline-flex`
     * alone is not enough: inside a flex parent the lockup is a flex item, and
     * the login hero (a `flex-col`) stretched it to the whole panel — harmless
     * while its contents were left-aligned, but with `items-center` the logo
     * jumped to the middle of the hero. An explicit width is never stretched.
     */
    <div className={`inline-flex w-fit flex-col items-center gap-1 ${className}`}>
      <Wordmark
        title="GoTutors Academy"
        className={`h-8 w-auto ${onDark ? "text-white" : "text-navy dark:text-ice"}`}
      />
      {/*
       * Picton reads on navy and on white alike, so it needs no variant.
       * Letter-spacing is added after every letter, the last one included, so
       * the box carries a trailing gap and a centred box puts the word visibly
       * left of centre. Equal padding on the left cancels it out.
       */}
      <div className="pl-[0.42em] text-[10px] font-medium uppercase leading-none tracking-[0.42em] text-picton">
        Academy
      </div>
    </div>
  );
}
