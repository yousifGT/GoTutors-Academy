import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes every cell, so a comma in a name cannot shift the columns", () => {
    expect(toCsv([["Ali, Mohammed", 7]])).toBe('"Ali, Mohammed","7"');
  });

  it("escapes quotes rather than ending the field early", () => {
    expect(toCsv([['He wrote "45"']])).toBe('"He wrote ""45"""');
  });

  it("survives a newline inside a comment", () => {
    expect(toCsv([["line one\nline two"]])).toBe('"line one\nline two"');
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    expect(toCsv([["=1+1"]])).toBe(`"'=1+1"`);
    expect(toCsv([["+44 7700 900000"]])).toBe(`"'+44 7700 900000"`);
    expect(toCsv([["-5"]])).toBe(`"'-5"`);
  });

  it("writes empty cells rather than the word undefined", () => {
    expect(toCsv([[null, undefined]])).toBe('"",""');
  });

  it("separates rows with CRLF, which is what spreadsheets expect", () => {
    expect(toCsv([["a"], ["b"]])).toBe('"a"\r\n"b"');
  });
});
