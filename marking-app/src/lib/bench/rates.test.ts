import { describe, it, expect } from "vitest";
import { costUsd, ratesFor } from "./rates";

const usage = { input: 4400, cacheRead: 3800, cacheWrite: 0, output: 4000 };

describe("costUsd", () => {
  it("prices each kind of token at its own rate", () => {
    // Opus 5: 4,400 × $5 + 3,800 × $0.50 + 4,000 × $25, per million.
    expect(costUsd("claude-opus-5", usage)).toBeCloseTo(0.0239 + 0.1, 4);
  });

  it("charges a cache write above the input rate on Anthropic", () => {
    const written = costUsd("claude-opus-5", { input: 0, cacheRead: 0, cacheWrite: 1_000_000, output: 0 });
    expect(written).toBeCloseTo(6.25);
  });

  it("costs a local model nothing, rather than nothing-known", () => {
    expect(costUsd("local:qwen3-vl:8b", usage)).toBe(0);
  });

  it("says it doesn't know rather than guessing for an unlisted model", () => {
    expect(costUsd("gpt-99-imaginary", usage)).toBeNull();
  });
});

describe("ratesFor", () => {
  it("switches to an announced price on the day it takes effect", () => {
    expect(ratesFor("gemini-3.8-flash", new Date("2026-12-31T12:00:00Z"))!.input).toBe(0.75);
    expect(ratesFor("gemini-3.8-flash", new Date("2027-01-01T00:00:00Z"))!.input).toBe(1.5);
    expect(ratesFor("gemini-3.8-flash", new Date("2027-01-01T00:00:00Z"))!.output).toBe(7.5);
  });

  it("leaves models with no announced change alone", () => {
    expect(ratesFor("claude-sonnet-5", new Date("2030-01-01"))!.input).toBe(2);
  });
});
