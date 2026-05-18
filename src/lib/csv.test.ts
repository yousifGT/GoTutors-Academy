import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("serialises basic rows", () => {
    const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }]);
    expect(csv).toBe("a,b\n1,x\n2,y");
  });

  it("escapes commas, quotes and newlines", () => {
    const csv = toCsv([{ a: 'he said "hi"', b: "one,two", c: "line1\nline2" }]);
    expect(csv).toBe('a,b,c\n"he said ""hi""","one,two","line1\nline2"');
  });

  it("handles null and undefined as empty", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe("a,b,c\n,,0");
  });

  it("returns empty string for no rows when no headers", () => {
    expect(toCsv([])).toBe("");
  });
});
