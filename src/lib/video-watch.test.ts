import { describe, it, expect } from "vitest";
import { genuinelyWatched, WATCH_COMPLETE_FRACTION } from "./video-watch";

describe("genuinelyWatched", () => {
  it("counts a full watch", () => {
    expect(genuinelyWatched(100, 100)).toBe(true);
  });

  it("counts reaching the completion fraction", () => {
    expect(genuinelyWatched(100 * WATCH_COMPLETE_FRACTION, 100)).toBe(true);
  });

  it("rejects a scrub-to-end with little actually watched", () => {
    // e.g. watched 19s of a 95s video, then dragged the scrubber to the end
    expect(genuinelyWatched(19, 95)).toBe(false);
  });

  it("rejects just under the threshold", () => {
    expect(genuinelyWatched(94, 100)).toBe(false);
  });

  it("rejects when the duration is unknown", () => {
    expect(genuinelyWatched(50, 0)).toBe(false);
  });
});
