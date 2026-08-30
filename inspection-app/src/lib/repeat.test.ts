import { describe, it, expect } from "vitest";
import { isRepeat, previouslyFlaggedSet, repeatsAmong, wasFlaggedBefore } from "./repeat";

const previous = previouslyFlaggedSet(["Fire exits clear", "Toilets clean and hygienic"]);

describe("wasFlaggedBefore", () => {
  it("is true whatever this visit says, so the inspector looks first", () => {
    expect(wasFlaggedBefore("Fire exits clear", previous)).toBe(true);
    expect(wasFlaggedBefore("Premises clean", previous)).toBe(false);
  });
});

describe("isRepeat", () => {
  it("needs both: flagged before, and flagged again", () => {
    expect(isRepeat("Fire exits clear", "IMPROVE", previous)).toBe(true);
    expect(isRepeat("Fire exits clear", "WELL", previous)).toBe(false);
    expect(isRepeat("Premises clean", "IMPROVE", previous)).toBe(false);
  });

  it("a fixed finding is not a repeat — that is the point of tracking it", () => {
    expect(isRepeat("Toilets clean and hygienic", "WELL", previous)).toBe(false);
  });

  it("is not confused by an observation or a missing bucket", () => {
    expect(isRepeat("Fire exits clear", "OBS", previous)).toBe(false);
    expect(isRepeat("Fire exits clear", null, previous)).toBe(false);
    expect(isRepeat("Fire exits clear", undefined, previous)).toBe(false);
  });

  it("finds nothing when there was no previous visit", () => {
    expect(isRepeat("Fire exits clear", "IMPROVE", previouslyFlaggedSet([]))).toBe(false);
  });
});

describe("repeatsAmong", () => {
  it("keeps only the unfixed findings, in the order given", () => {
    const rows = [
      { question: "Premises clean", bucket: "IMPROVE" },
      { question: "Fire exits clear", bucket: "IMPROVE" },
      { question: "Toilets clean and hygienic", bucket: "WELL" },
    ];
    expect(repeatsAmong(rows, previous)).toEqual([{ question: "Fire exits clear", bucket: "IMPROVE" }]);
  });
});
