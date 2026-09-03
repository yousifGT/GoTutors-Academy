import type { Prisma } from "@prisma/client";
import { inspectionScope, type Viewer } from "@/lib/access";

/**
 * The filters behind the inspections list, in one place.
 *
 * The list screen and the CSV export read the same rows through this, so an
 * export can never quietly cover a different set from the one on screen. A
 * spreadsheet that disagrees with the page it was taken from is worse than no
 * spreadsheet, because nobody can tell which of the two is wrong.
 */
export interface InspectionFilters {
  centreId: string | null;
  range: { gte?: Date; lte?: Date } | null;
  status: "DRAFT" | "SUBMITTED" | null;
  q: string | null;
  unreadOnly: boolean;
}

export function parseInspectionFilters(url: URL): InspectionFilters {
  const centreId = url.searchParams.get("centre");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  /** YYYY-MM — the way people actually ask: "the March visits". */
  const month = url.searchParams.get("month");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();

  let range: { gte?: Date; lte?: Date } | null = null;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    // Day 0 of the next month is the last day of this one, so this holds for
    // February and for leap years without special-casing either.
    range = { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) };
  } else if (from || to) {
    range = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  }

  return {
    centreId: centreId || null,
    range,
    status: status === "DRAFT" || status === "SUBMITTED" ? status : null,
    q: q || null,
    unreadOnly: url.searchParams.get("unread") === "1",
  };
}

export function inspectionWhere(viewer: Viewer, f: InspectionFilters): Prisma.InspectionWhereInput {
  return {
    AND: [
      inspectionScope(viewer),
      f.centreId ? { centreId: f.centreId } : {},
      f.range ? { date: f.range } : {},
      f.status ? { status: f.status } : {},
      f.unreadOnly ? { deliveries: { some: { userId: viewer.id, readAt: null } } } : {},
      f.q
        ? {
            OR: [
              { centre: { name: { contains: f.q, mode: "insensitive" } } },
              { inspector: { name: { contains: f.q, mode: "insensitive" } } },
              { verdict: { contains: f.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
}

/** How the filters read in an audit entry or a filename. */
export function describeFilters(f: InspectionFilters): string {
  const parts: string[] = [];
  if (f.centreId) parts.push(`centre=${f.centreId}`);
  if (f.range?.gte) parts.push(`from=${f.range.gte.toISOString().slice(0, 10)}`);
  if (f.range?.lte) parts.push(`to=${f.range.lte.toISOString().slice(0, 10)}`);
  if (f.status) parts.push(`status=${f.status}`);
  if (f.q) parts.push(`q=${f.q}`);
  if (f.unreadOnly) parts.push("unread");
  return parts.join(" ") || "everything in scope";
}
