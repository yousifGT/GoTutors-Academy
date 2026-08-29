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

/* ---------- resolving a booked visit ---------- */

export type VisitStatus = "PLANNED" | "DONE" | "MISSED" | "CANCELLED";

/**
 * Whether a status may be set by hand, given what actually happened.
 *
 * The one hard rule is that an inspection on the record contradicts anything
 * except DONE. Everything else is a judgement a manager is entitled to make:
 * a visit made but recorded on paper is DONE, a visit nobody turned up to is
 * MISSED, a cancelled one that is back on is PLANNED again.
 */
export function statusChangeProblem(
  next: VisitStatus,
  visit: { hasInspection: boolean; date: Date },
  reason: string | null | undefined,
  today: Date = new Date()
): string | null {
  if (visit.hasInspection && next !== "DONE") {
    return "This visit has an inspection on the record, so it cannot be marked anything but done.";
  }
  if (next === "MISSED") {
    if (daysBetween(visit.date, today) < 0) {
      return "That visit is still in the future — cancel it instead of marking it missed.";
    }
    if (!reason?.trim()) {
      return "Say why it was missed. A mark against someone's name should not be a bare flag.";
    }
  }
  return null;
}

/** A booked day that has passed with nothing recorded and no decision made. */
export function needsResolving(
  visit: { status: VisitStatus; hasInspection: boolean; date: Date },
  today: Date = new Date()
): boolean {
  return visit.status === "PLANNED" && !visit.hasInspection && daysBetween(visit.date, today) > 0;
}

export interface Attendance {
  inspectorId: string;
  inspector: string;
  booked: number;
  done: number;
  missed: number;
  /** Booked days that have passed with no decision yet — not held against anyone. */
  unresolved: number;
  /** Of the visits actually settled, the share that were made. Null when none are. */
  rate: number | null;
}

/**
 * Attendance per inspector.
 *
 * Unresolved days are counted separately and left out of the rate. A visit
 * nobody has looked at yet is a gap in the paperwork, not a mark against the
 * inspector, and folding the two together would make the number dishonest.
 */
export function attendance(
  visits: { inspectorId: string; inspector: string; status: VisitStatus; hasInspection: boolean; date: Date }[],
  today: Date = new Date()
): Attendance[] {
  const by = new Map<string, Attendance>();
  for (const v of visits) {
    if (v.status === "CANCELLED") continue; // called off, not missed
    const row =
      by.get(v.inspectorId) ??
      { inspectorId: v.inspectorId, inspector: v.inspector, booked: 0, done: 0, missed: 0, unresolved: 0, rate: null };
    row.booked++;
    if (v.status === "DONE" || v.hasInspection) row.done++;
    else if (v.status === "MISSED") row.missed++;
    else if (needsResolving({ ...v, status: v.status }, today)) row.unresolved++;
    by.set(v.inspectorId, row);
  }
  return Array.from(by.values())
    .map((r) => {
      const settled = r.done + r.missed;
      return { ...r, rate: settled ? Math.round((r.done / settled) * 100) : null };
    })
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || b.missed - a.missed);
}
