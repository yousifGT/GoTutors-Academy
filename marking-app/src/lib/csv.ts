/**
 * CSV a spreadsheet will actually open.
 *
 * Quoting everything is the boring choice and the right one: a student's name
 * with a comma in it, or a comment with a newline, silently shifts every column
 * after it and nobody notices until the numbers are already in a report.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  // A leading =, +, - or @ is executed as a formula by Excel and Sheets when the
  // file is opened. Prefixing breaks that without changing what a reader sees.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
