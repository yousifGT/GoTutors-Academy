import type { Role } from "@prisma/client";

/**
 * Rules about planned visits and about how long a centre may go uninspected.
 */

/** A centre unvisited for this long is flagged. Matches the prototype. */
export const OVERDUE_DAYS = 30;

/** Who may book a visit into someone's calendar. */
export function canScheduleVisits(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE" || role === "REGIONAL_MANAGER";
}

/** Midnight UTC for a YYYY-MM-DD string — the form the `@db.Date` column stores. */
export function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/** What the database can tell us about a centre. */
export interface CoverageInput {
  centreId: string;
  centre: string;
  lastInspected: Date | null;
  /** A visit already in the diary, so this is not a gap anyone needs to fill. */
  nextPlanned: Date | null;
}

/** What we work out from it. */
export interface Coverage extends CoverageInput {
  daysSince: number | null;
  overdue: boolean;
  neverInspected: boolean;
}

/**
 * Which centres need attention.
 *
 * A centre already in someone's diary is not counted as overdue however long it
 * has been — the point of the list is to surface gaps nobody has picked up, and
 * leaving booked visits on it trains people to ignore it.
 */
export function coverage(rows: CoverageInput[], today: Date = new Date()): Coverage[] {
  return rows
    .map((r) => {
      const daysSince = r.lastInspected ? daysBetween(r.lastInspected, today) : null;
      const neverInspected = r.lastInspected === null;
      const overdue = r.nextPlanned === null && (neverInspected || (daysSince ?? 0) > OVERDUE_DAYS);
      return { ...r, daysSince, overdue, neverInspected };
    })
    .sort((a, b) => {
      // Worst first: never inspected, then longest since, then the rest.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.neverInspected !== b.neverInspected) return a.neverInspected ? -1 : 1;
      return (b.daysSince ?? -1) - (a.daysSince ?? -1);
    });
}
