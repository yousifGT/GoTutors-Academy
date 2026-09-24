import { describe, it, expect } from "vitest";
import { canExport, confidenceLabel, hasScore, statusView, trend, WAITING_ON_HUMAN } from "./view";
import { CONFIDENCE_FLOOR } from "./scoring";

describe("statusView", () => {
  it("has wording for every status, so no page can render a blank chip", () => {
    for (const status of ["PENDING", "MARKING", "MARKED", "NEEDS_HUMAN", "REVIEWED", "FAILED"] as const) {
      expect(statusView(status).label.length).toBeGreaterThan(0);
      expect(statusView(status).hint.length).toBeGreaterThan(0);
    }
  });

  it("does not describe the human fallback as an error — it is the expected path", () => {
    expect(statusView("NEEDS_HUMAN").label.toLowerCase()).not.toContain("fail");
    expect(statusView("NEEDS_HUMAN").label.toLowerCase()).not.toContain("error");
  });
});

describe("WAITING_ON_HUMAN", () => {
  it("is exactly the statuses a person has to act on", () => {
    expect([...WAITING_ON_HUMAN].sort()).toEqual(["FAILED", "NEEDS_HUMAN"]);
  });
});

describe("hasScore", () => {
  it("shows a score only once there is one", () => {
    expect(hasScore("MARKED")).toBe(true);
    expect(hasScore("REVIEWED")).toBe(true);
    expect(hasScore("NEEDS_HUMAN")).toBe(true);
    expect(hasScore("PENDING")).toBe(false);
    expect(hasScore("MARKING")).toBe(false);
    expect(hasScore("FAILED")).toBe(false);
  });
});

describe("confidenceLabel", () => {
  it("calls anything below the scoring floor low, so the two agree", () => {
    expect(confidenceLabel(CONFIDENCE_FLOOR - 0.01)).toBe("Low");
    expect(confidenceLabel(CONFIDENCE_FLOOR)).toBe("Moderate");
    expect(confidenceLabel(0.95)).toBe("High");
  });

  it("shows a dash rather than inventing a number", () => {
    expect(confidenceLabel(null)).toBe("—");
  });
});

describe("trend", () => {
  it("refuses to call one result a trend", () => {
    expect(trend([])).toBeNull();
    expect(trend([70])).toBeNull();
  });

  it("measures first to latest", () => {
    expect(trend([50, 60, 70])).toEqual({ change: 20, direction: "up" });
    expect(trend([70, 40])).toEqual({ change: -30, direction: "down" });
  });

  it("treats small movement as flat rather than as progress", () => {
    expect(trend([70, 71])?.direction).toBe("flat");
  });
});

describe("canExport", () => {
  it("allows a finished paper", () => {
    expect(canExport("MARKED")).toBe(true);
    expect(canExport("REVIEWED")).toBe(true);
  });

  it("refuses a paper that still needs a person, even though it has a score", () => {
    expect(hasScore("NEEDS_HUMAN")).toBe(true);
    expect(canExport("NEEDS_HUMAN")).toBe(false);
  });

  it("refuses papers with nothing to report", () => {
    expect(canExport("PENDING")).toBe(false);
    expect(canExport("MARKING")).toBe(false);
    expect(canExport("FAILED")).toBe(false);
  });
});
