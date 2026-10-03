import { describe, it, expect } from "vitest";
import { parseMarkingText } from "./response";

const good = JSON.stringify({
  marks: [{ label: "1", transcript: "45", legible: true, awarded: 2, comment: "Right.", confidence: 0.9 }],
  strengths: [],
  improvements: [],
  overallComment: "Good.",
  unreadable: false,
});

describe("parseMarkingText", () => {
  it("reads a bare JSON reply", () => {
    expect(parseMarkingText(good).ok).toBe(true);
  });

  it("tolerates the code fence local models often add", () => {
    expect(parseMarkingText("```json\n" + good + "\n```").ok).toBe(true);
    expect(parseMarkingText("```\n" + good + "\n```").ok).toBe(true);
  });

  it("says what was wrong rather than guessing", () => {
    expect(parseMarkingText("   ")).toEqual({ ok: false, kind: "empty" });
    expect(parseMarkingText("Here are the marks: 2/2")).toEqual({ ok: false, kind: "not_json" });
    expect(parseMarkingText('{"marks": "lots"}')).toEqual({ ok: false, kind: "wrong_shape" });
  });

  it("does not accept prose around the JSON — a reply has to be the marks and nothing else", () => {
    expect(parseMarkingText("Sure! " + good).ok).toBe(false);
  });
});
