import { describe, expect, it } from "vitest";
import { cell, filename, toCsv } from "./csv";

const body = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("cell", () => {
  it("leaves ordinary text alone", () => {
    expect(cell("Uxbridge")).toBe("Uxbridge");
  });

  it("quotes anything holding a comma, a quote or a line break", () => {
    expect(cell("Ealing, Hanwell")).toBe('"Ealing, Hanwell"');
    expect(cell('He said "fine"')).toBe('"He said ""fine"""');
    expect(cell("First line\nsecond line")).toBe('"First line\nsecond line"');
  });

  it("writes numbers bare so they arrive as numbers", () => {
    expect(cell(88)).toBe("88");
    expect(cell(-4)).toBe("-4");
    expect(cell(0)).toBe("0");
  });

  it("writes an absent value as an empty cell, not the word null", () => {
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
    expect(cell(Number.NaN)).toBe("");
  });

  describe("a note that a spreadsheet would treat as a formula", () => {
    // These are typed by people on site and the file is emailed onwards.
    it.each(["=1+1", "+44 7700 900000", "-see photo", "@rota", " =cmd", "\t=1"])("is defused: %s", (raw) => {
      const out = cell(raw);
      expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
    });

    it("and is still readable once defused", () => {
      expect(cell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    });

    it("without touching text that merely contains one of those characters", () => {
      expect(cell("2 + 2 chairs")).toBe("2 + 2 chairs");
      expect(cell("head@gotutors.test")).toBe("head@gotutors.test");
    });
  });
});

describe("toCsv", () => {
  it("writes a header row and RFC 4180 line endings", () => {
    const csv = toCsv(["Centre", "Score"], [["Uxbridge", 88], ["Acton", 71]]);
    expect(body(csv)).toEqual(["Centre,Score", "Uxbridge,88", "Acton,71"]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("starts with a byte-order mark so Excel reads it as UTF-8", () => {
    // Without it, a name with an accent in it opens mangled.
    expect(toCsv(["Name"], [["Zoë"]]).startsWith("﻿")).toBe(true);
  });

  it("keeps the columns aligned when a note holds a line break", () => {
    const csv = toCsv(["Question", "Note", "Bucket"], [["Toilets", "Two locks broken.\nOne door off.", "IMPROVE"]]);
    // One record, even though the note spans two lines.
    expect(body(csv)).toHaveLength(2);
    expect(csv).toContain('"Two locks broken.\nOne door off."');
  });
});

describe("filename", () => {
  const on = new Date("2026-09-03T11:00:00Z");

  it("names what it is, what it covers and when it was taken", () => {
    expect(filename(["inspections", "Uxbridge"], on)).toBe("inspections-uxbridge-2026-09-03.csv");
  });

  it("cannot put a slash or a quote into a filename", () => {
    expect(filename(["answers", 'Ealing / "Hanwell"'], on)).toBe("answers-ealing-hanwell-2026-09-03.csv");
  });

  it("skips the parts that are not there", () => {
    expect(filename(["inspections", null, undefined, "  "], on)).toBe("inspections-2026-09-03.csv");
  });
});
