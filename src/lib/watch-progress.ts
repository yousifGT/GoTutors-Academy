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
  /** True only for providers we genuinely can't measure (Loom). Gates the manual
   *  confirmation so a trackable lesson can't be completed by simply omitting the
   *  duration and claiming videoWatched. */
  manualAllowed: boolean;
  alreadyWatched: boolean;
}): { timeSpent: number; videoWatched: boolean } {
  const claimed = Math.max(0, Math.floor(opts.reportedWatchedSeconds || 0));
  const cap = Math.floor(Math.max(0, opts.elapsedRealSeconds) * MAX_PLAYBACK_SPEED) + CAP_GRACE_SECONDS;
  const timeSpent = Math.max(opts.previousTimeSpent, Math.min(claimed, cap));

  let videoWatched: boolean;
  if (opts.durationSeconds > 0) {
    videoWatched = timeSpent >= opts.durationSeconds * SERVER_WATCH_FRACTION;
  } else if (opts.manualAllowed) {
    // Untrackable provider (Loom): a manual confirm counts after a small real-time floor.
    videoWatched = opts.clientClaimsWatched && opts.elapsedRealSeconds >= UNKNOWN_DURATION_FLOOR_SECONDS;
  } else {
    // Trackable provider with no measured duration yet → not watched. A bare
    // videoWatched:true claim can never complete it.
    videoWatched = false;
  }
  return { timeSpent, videoWatched: opts.alreadyWatched || videoWatched };
}

/**
 * How far the position may legitimately move between two samples.
 *
 * A flat allowance was the bug: six seconds of slack per seek meant you could
 * nudge forward six seconds at a time, indefinitely, and the client recorded
 * every nudge as watched. It also wasn't what the rule was meant to be — going
 * back should always be free, going forward should never outrun real time
 * except by playing faster.
 *
 * So measure it: position may advance by at most the wall-clock time since the
 * last sample, times the playback rate, plus a small margin for timer jitter and
 * buffering. Sampling is every ~250ms (uploaded) or 1000ms (embeds), so honest
 * playback stays well inside it while a seek does not.
 *
 * `sinceMs` is capped because a paused or backgrounded tab keeps wall-clock
 * running while the video doesn't; without the cap that idle time would bank up
 * into an allowance a single forward jump could spend.
 */
export const JITTER_SECONDS = 1;
export const MAX_SAMPLE_GAP_MS = 2000;

export function allowedAdvance(sinceMs: number | null, rate: number): number {
  if (sinceMs === null) return JITTER_SECONDS; // first sample, or resumed from a pause
  const speed = Math.min(Math.max(rate || 1, 1), MAX_PLAYBACK_SPEED);
  return (Math.min(sinceMs, MAX_SAMPLE_GAP_MS) / 1000) * speed + JITTER_SECONDS;
}
