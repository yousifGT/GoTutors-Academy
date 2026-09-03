/**
 * Writing CSV that survives the program it will actually be opened in.
 *
 * An export is not a debugging aid — it is the file somebody sends to a
 * franchisee or opens next to a board pack, so the two things that go wrong in
 * practice are worth handling properly rather than joining values with commas:
 *
 *  - Inspection notes are free text. They hold commas, quotation marks and
 *    line breaks, and a note broken across two rows silently misaligns every
 *    column after it.
 *  - A cell beginning `=`, `+`, `-` or `@` is a formula to Excel, Sheets and
 *    LibreOffice alike. A note that starts "=- see photo" is a broken cell at
 *    best; a crafted one is a way to get a spreadsheet to fetch a URL or run a
 *    command on the machine of whoever opens it. Notes here are typed by people
 *    on site into a system holding photographs from a children's setting, and
 *    the file is emailed onwards, so this is guarded rather than assumed away.
 */

/** A number stays a number in the spreadsheet; everything else is text. */
export type Cell = string | number | null | undefined;

const NEEDS_QUOTES = /[",\r\n]/;
/** Leading whitespace counts: Excel strips it before deciding what a cell is. */
const FORMULA = /^[\s]*[=+\-@\t\r]/;

export function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  // Numbers are written bare so they arrive as numbers, and cannot be a
  // formula: a negative number is a value, not an expression.
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  // A leading apostrophe is the convention every spreadsheet understands for
  // "this is text". It is visible in the cell, which is the honest trade: a
  // slightly odd-looking note beats a file that runs something.
  const text = FORMULA.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(","));
  // RFC 4180 line endings, and a byte-order mark so Excel reads the file as
  // UTF-8 rather than guessing at a code page and mangling every name with an
  // accent in it.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * A filename a person can find again later: what it is, what it covers, and
 * when it was taken. Anything that is not a letter, a digit or a dash is
 * dropped rather than escaped — a centre called `Ealing / Hanwell` must not put
 * a slash in a filename, and quotation marks in a `Content-Disposition` header
 * are their own problem.
 */
export function filename(parts: (string | null | undefined)[], on: Date): string {
  const slug = parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) => p.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("-");
  return `${slug || "export"}-${on.toISOString().slice(0, 10)}.csv`;
}
