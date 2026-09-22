import { describe, it, expect, afterEach } from "vitest";
import { markPaper, markingIsConfigured } from "./marker";
import type { SchemeQuestion } from "./types";

const originalKey = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

const questions: SchemeQuestion[] = [
  { id: "q1", label: "1", order: 0, prompt: "2+2", expectedAnswer: "4", marks: 1 },
];
const page = { data: "aGVsbG8=", mediaType: "image/png" as const };

describe("markingIsConfigured", () => {
  it("is false without a key and true with one", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(markingIsConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(markingIsConfigured()).toBe(true);
  });
});

describe("markPaper", () => {
  it("returns a readable reason instead of throwing when no key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const outcome = await markPaper({ schemeTitle: "P", subject: "Maths", questions, examples: [], pages: [page] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("ANTHROPIC_API_KEY");
      // Not retryable: pressing the button again cannot conjure a key.
      expect(outcome.retryable).toBe(false);
    }
  });

  it("refuses a paper with no photographs rather than calling out with nothing", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const outcome = await markPaper({ schemeTitle: "P", subject: "Maths", questions, examples: [], pages: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("No photographs");
  });

  it("refuses a scheme with no questions", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const outcome = await markPaper({ schemeTitle: "P", subject: "Maths", questions: [], examples: [], pages: [page] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("no questions");
  });
});
