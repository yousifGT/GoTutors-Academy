import { describe, it, expect } from "vitest";
import { nextLabel } from "./labels";

describe("nextLabel", () => {
  it("counts up plain numbers, so a 30-question paper isn't 30 manual labels", () => {
    expect(nextLabel("1")).toBe("2");
    expect(nextLabel("9")).toBe("10");
  });

  it("steps the letter on a lettered part", () => {
    expect(nextLabel("2a")).toBe("2b");
    expect(nextLabel("12C")).toBe("12D");
  });

  it("gives up rather than guessing wrong", () => {
    expect(nextLabel("2z")).toBe("");
    expect(nextLabel("Section A")).toBe("");
    expect(nextLabel("")).toBe("");
  });
});
