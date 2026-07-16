import { describe, it, expect } from "vitest";
import { computeWatchState, SERVER_WATCH_FRACTION } from "./watch-progress";

const base = {
  previousTimeSpent: 0,
  reportedWatchedSeconds: 0,
  elapsedRealSeconds: 0,
  durationSeconds: 600,
  clientClaimsWatched: false,
  manualAllowed: false,
  alreadyWatched: false,
};

describe("computeWatchState", () => {
  it("does not complete on a forged instant claim (little real time elapsed)", () => {
    const r = computeWatchState({ ...base, reportedWatchedSeconds: 600, elapsedRealSeconds: 2 });
    expect(r.videoWatched).toBe(false);
    expect(r.timeSpent).toBeLessThan(600);
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
    expect(r.videoWatched).toBe(false);
  });

  it("never lets accumulated time decrease", () => {
    const r = computeWatchState({ ...base, previousTimeSpent: 550, reportedWatchedSeconds: 0, elapsedRealSeconds: 5 });
    expect(r.timeSpent).toBe(550);
    expect(r.videoWatched).toBe(true);
  });

  it("stays watched once already watched", () => {
    const r = computeWatchState({ ...base, alreadyWatched: true, elapsedRealSeconds: 1 });
    expect(r.videoWatched).toBe(true);
  });

  it("a trackable lesson can't be completed by a bare claim with no measured duration", () => {
    // provider isn't Loom (manualAllowed=false) and duration unknown -> stays locked
    const r = computeWatchState({ ...base, manualAllowed: false, durationSeconds: 0, clientClaimsWatched: true, elapsedRealSeconds: 100 });
    expect(r.videoWatched).toBe(false);
  });

  it("Loom (manualAllowed): a manual confirm counts only after the real-time floor", () => {
    expect(computeWatchState({ ...base, manualAllowed: true, durationSeconds: 0, clientClaimsWatched: true, elapsedRealSeconds: 1 }).videoWatched).toBe(false);
    expect(computeWatchState({ ...base, manualAllowed: true, durationSeconds: 0, clientClaimsWatched: true, elapsedRealSeconds: 10 }).videoWatched).toBe(true);
  });

  it("Loom ignores a claim-less request", () => {
    expect(computeWatchState({ ...base, manualAllowed: true, durationSeconds: 0, clientClaimsWatched: false, elapsedRealSeconds: 100 }).videoWatched).toBe(false);
  });
});
