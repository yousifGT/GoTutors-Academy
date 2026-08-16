import { describe, it, expect } from "vitest";
import { computeWatchState, SERVER_WATCH_FRACTION, allowedAdvance, JITTER_SECONDS, MAX_SAMPLE_GAP_MS, MAX_PLAYBACK_SPEED } from "./watch-progress";

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

// The client-side counterpart of the server cap. The bug it replaces was a flat
// six-second budget per seek, which let you nudge forward six seconds at a time
// indefinitely while the client recorded every nudge as watched.
describe("allowedAdvance", () => {
  it("allows roughly the elapsed time at normal speed", () => {
    // 1s of real time at 1x, plus the jitter margin.
    expect(allowedAdvance(1000, 1)).toBeCloseTo(2, 5);
  });

  it("scales with playback rate, so 2x viewing is fully supported", () => {
    expect(allowedAdvance(1000, 2)).toBeCloseTo(3, 5);
  });

  it("never credits faster than the server's cap, whatever the player reports", () => {
    // A 16x YouTube rate must not buy 16 seconds per second.
    expect(allowedAdvance(1000, 16)).toBe(allowedAdvance(1000, MAX_PLAYBACK_SPEED));
  });

  it("treats a rate below 1 as 1, so slow playback isn't penalised", () => {
    expect(allowedAdvance(1000, 0.5)).toBeCloseTo(2, 5);
    expect(allowedAdvance(1000, 0)).toBeCloseTo(2, 5);
  });

  // Idle time must not bank up: a tab paused or backgrounded for minutes would
  // otherwise hand a single forward jump an enormous allowance.
  it("caps the gap so a long pause can't be spent on one seek", () => {
    expect(allowedAdvance(5 * 60_000, 1)).toBe(allowedAdvance(MAX_SAMPLE_GAP_MS, 1));
  });

  it("gives only the jitter margin with no previous sample", () => {
    expect(allowedAdvance(null, 2)).toBe(JITTER_SECONDS);
  });

  // The property that actually matters: a jump far beyond real time is refused.
  it("refuses a jump that outruns real time", () => {
    const jumpSeconds = 60;
    expect(jumpSeconds > allowedAdvance(1000, MAX_PLAYBACK_SPEED)).toBe(true);
  });
});
