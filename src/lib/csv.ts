export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0 && !headers) return "";
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "string" ? v : String(v);
    // A cell starting = + - @ (or tab/CR) is run as a formula by Excel/Sheets;
    // titles and names are user-written, so neutralise it with a leading quote.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const out = [cols.join(",")];
  for (const r of rows) out.push(cols.map((c) => esc(r[c])).join(","));
  return out.join("\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
