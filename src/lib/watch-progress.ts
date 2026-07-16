/** A video counts as watched once the trusted watch position reaches this fraction of its length. */
export const SERVER_WATCH_FRACTION = 0.9;

/** Trainees may watch up to this speed; the trusted-position cap scales with it. */
export const MAX_PLAYBACK_SPEED = 2;

/** Headroom (seconds) for player startup/buffering/jitter so the cap isn't hit at the boundary. */
const CAP_GRACE_SECONDS = 5;

/** For providers we can't measure (e.g. Loom), require at least this much real time before a manual confirm counts. */
const UNKNOWN_DURATION_FLOOR_SECONDS = 5;

/**
 * Decide, server-side, how much of a lesson video a trainee has genuinely watched
 * and whether it now counts as complete.
 *
 * The client reports the furthest position it has reached (`reportedWatchedSeconds`)
 * and the video `durationSeconds`. Neither can be trusted on its own — a crafted
 * request could claim the whole video instantly. So the reported position is
 * accepted only up to what is reachable at ≤ MAX_PLAYBACK_SPEED × the real
 * wall-clock time elapsed since the lesson was opened. This:
 *   - supports up to 2× playback (position advances 2s per 1s of real time), but
 *   - stops a fast-forward or a forged API call completing the video instantly —
 *     faking still requires waiting ~duration / 2 in real time.
 *
 * Providers we can't measure (durationSeconds = 0, e.g. Loom) fall back to a
 * manual confirmation gated behind a small real-time floor.
 */
export function computeWatchState(opts: {
  previousTimeSpent: number;
  reportedWatchedSeconds: number;
  elapsedRealSeconds: number;
  durationSeconds: number;
  clientClaimsWatched: boolean;
  alreadyWatched: boolean;
}): { timeSpent: number; videoWatched: boolean } {
  const claimed = Math.max(0, Math.floor(opts.reportedWatchedSeconds || 0));
  const cap = Math.floor(Math.max(0, opts.elapsedRealSeconds) * MAX_PLAYBACK_SPEED) + CAP_GRACE_SECONDS;
  const timeSpent = Math.max(opts.previousTimeSpent, Math.min(claimed, cap));

  let videoWatched: boolean;
  if (opts.durationSeconds > 0) {
    videoWatched = timeSpent >= opts.durationSeconds * SERVER_WATCH_FRACTION;
  } else {
    videoWatched = opts.clientClaimsWatched && opts.elapsedRealSeconds >= UNKNOWN_DURATION_FLOOR_SECONDS;
  }
  return { timeSpent, videoWatched: opts.alreadyWatched || videoWatched };
}
