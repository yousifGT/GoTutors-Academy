import { describe, it, expect } from "vitest";
import { computeWatchState, SERVER_WATCH_FRACTION } from "./watch-progress";

const base = {
  previousTimeSpent: 0,
  reportedWatchedSeconds: 0,
  elapsedRealSeconds: 0,
  durationSeconds: 600,
  clientClaimsWatched: false,
  alreadyWatched: false,
};

describe("computeWatchState", () => {
  it("does not complete on a forged instant claim (little real time elapsed)", () => {
    const r = computeWatchState({ ...base, reportedWatchedSeconds: 600, elapsedRealSeconds: 2 });
    expect(r.videoWatched).toBe(false);
    expect(r.timeSpent).toBeLessThan(600); // capped by elapsed*2 + grace
  });

  it("completes a normal 1x watch-through", () => {
    const r = computeWatchState({ ...base, reportedWatchedSeconds: 600, elapsedRealSeconds: 600 });
    expect(r.videoWatched).toBe(true);
  });

  it("completes a 2x watch-through (position 600 in 300s real time)", () => {
    const r = computeWatchState({ ...base, reportedWatchedSeconds: 600, elapsedRealSeconds: 300 });
    expect(r.timeSpent).toBeGreaterThanOrEqual(600 * SERVER_WATCH_FRACTION);
    expect(r.videoWatched).toBe(true);
  });

  it("rejects faster-than-2x (position 600 claimed in 100s real time)", () => {
    const r = computeWatchState({ ...base, reportedWatchedSeconds: 600, elapsedRealSeconds: 100 });
    expect(r.videoWatched).toBe(false); // capped near 205, below 540
  });

  it("never lets accumulated time decrease", () => {
    const r = computeWatchState({ ...base, previousTimeSpent: 550, reportedWatchedSeconds: 0, elapsedRealSeconds: 5 });
    expect(r.timeSpent).toBe(550);
    expect(r.videoWatched).toBe(true); // 550 >= 540
  });

  it("stays watched once already watched", () => {
    const r = computeWatchState({ ...base, alreadyWatched: true, elapsedRealSeconds: 1 });
    expect(r.videoWatched).toBe(true);
  });

  it("untrackable provider (duration 0): manual confirm counts only after the real-time floor", () => {
    expect(computeWatchState({ ...base, durationSeconds: 0, clientClaimsWatched: true, elapsedRealSeconds: 1 }).videoWatched).toBe(false);
    expect(computeWatchState({ ...base, durationSeconds: 0, clientClaimsWatched: true, elapsedRealSeconds: 10 }).videoWatched).toBe(true);
  });

  it("untrackable provider ignores a claim-less request", () => {
    expect(computeWatchState({ ...base, durationSeconds: 0, clientClaimsWatched: false, elapsedRealSeconds: 100 }).videoWatched).toBe(false);
  });
});
