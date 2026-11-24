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

  // A course title like =HYPERLINK(...) would run when a centre admin opened
  // the export in Excel.
  it("neutralises cells that a spreadsheet would run as a formula", () => {
    const out = toCsv([{ a: "=1+1", b: "+x", c: "-y", d: "@z", e: "plain", f: -5 }]);
    expect(out.split("\n")[1]).toBe("'=1+1,'+x,'-y,'@z,plain,-5");
  });
});
