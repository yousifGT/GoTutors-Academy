import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from "@/lib/brand-mark";

/**
 * The "GoTutors" wordmark, drawn inline.
 *
 * Inline rather than `<img src="/go-wordmark-navy.svg">` because it has to
 * invert: the sidebar and the login hero are navy. `fill` is inherited in SVG,
 * so `currentColor` here means a caller sets the colour with an ordinary text
 * class — `text-navy`, `text-white` — and dark mode works the same way.
 *
 * `aria-hidden` by default: this is almost always sitting next to the name in
 * text, and a screen reader announcing "GoTutors" twice helps nobody. Pass a
 * `title` where it stands alone.
 */
export function Wordmark({
  className = "",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {WORDMARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
