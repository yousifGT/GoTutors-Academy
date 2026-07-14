/**
 * Fraction of a video that must be genuinely played through for it to count as
 * watched. Shared by every player so the completion bar and the "ended" check
 * can never disagree.
 */
export const WATCH_COMPLETE_FRACTION = 0.95;

/**
 * Whether a video counts as genuinely watched. `maxWatchedSeconds` is the
 * furthest playback position reached through real playback (scrub-ahead is
 * clamped, so it can't inflate it). The player's "ended" event alone is NOT
 * proof — scrubbing to the end also fires it — so completion must pass this.
 */
export function genuinelyWatched(maxWatchedSeconds: number, durationSeconds: number): boolean {
  if (durationSeconds <= 0) return false;
  return maxWatchedSeconds >= durationSeconds * WATCH_COMPLETE_FRACTION;
}
