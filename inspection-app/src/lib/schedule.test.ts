import { describe, it, expect } from "vitest";
import {
  OVERDUE_DAYS,
  asDate,
  attendance,
  canScheduleVisits,
  coverage,
  daysBetween,
  needsResolving,
  statusChangeProblem,
} from "./schedule";

const today = asDate("2026-08-29");
const ago = (n: number) => new Date(today.getTime() - n * 86_400_000);

describe("canScheduleVisits", () => {
  it("is head office and above, plus regional managers who run a patch", () => {
    expect(canScheduleVisits("SUPER_ADMIN")).toBe(true);
    expect(canScheduleVisits("HEAD_OFFICE")).toBe(true);
    expect(canScheduleVisits("REGIONAL_MANAGER")).toBe(true);
    expect(canScheduleVisits("INSPECTOR")).toBe(false);
    expect(canScheduleVisits("CENTRE_HEAD")).toBe(false);
    expect(canScheduleVisits("READ_ONLY")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole days, ignoring the time of day", () => {
    expect(daysBetween(new Date("2026-08-01T23:59:00Z"), new Date("2026-08-02T00:01:00Z"))).toBe(1);
    expect(daysBetween(asDate("2026-08-01"), asDate("2026-08-31"))).toBe(30);
  });

  it("handles a month boundary", () => {
    expect(daysBetween(asDate("2026-01-31"), asDate("2026-02-01"))).toBe(1);
  });
});

describe("coverage", () => {
  const row = (over: Partial<Parameters<typeof coverage>[0][0]>) => ({
    centreId: "c",
    centre: "Acton",
    lastInspected: null,
    nextPlanned: null,
    ...over,
  });

  it("flags a centre never inspected", () => {
    const [r] = coverage([row({})], today);
    expect(r.neverInspected).toBe(true);
    expect(r.overdue).toBe(true);
    expect(r.daysSince).toBeNull();
  });

  it("flags one past the threshold, and not one inside it", () => {
    const [late] = coverage([row({ lastInspected: ago(OVERDUE_DAYS + 1) })], today);
    expect(late.overdue).toBe(true);
    const [fine] = coverage([row({ lastInspected: ago(OVERDUE_DAYS) })], today);
    expect(fine.overdue).toBe(false);
  });

  it("does not flag one already in the diary, however long it has been", () => {
    // The list is for gaps nobody has picked up. Leaving booked visits on it
    // teaches people to ignore it.
    const [r] = coverage([row({ lastInspected: ago(400), nextPlanned: asDate("2026-09-02") })], today);
    expect(r.overdue).toBe(false);
    expect(r.daysSince).toBe(400);
  });

  it("puts the worst first", () => {
    const rows = coverage(
      [
        row({ centreId: "recent", lastInspected: ago(2) }),
        row({ centreId: "never" }),
        row({ centreId: "stale", lastInspected: ago(90) }),
        row({ centreId: "booked", lastInspected: ago(200), nextPlanned: asDate("2026-09-01") }),
      ],
      today
    );
    expect(rows.map((r) => r.centreId)).toEqual(["never", "stale", "booked", "recent"]);
  });
});

describe("statusChangeProblem", () => {
  const past = { hasInspection: false, date: asDate("2026-08-20") };

  it("refuses anything but done once an inspection exists", () => {
    const done = { hasInspection: true, date: asDate("2026-08-20") };
    expect(statusChangeProblem("DONE", done, null, today)).toBeNull();
    expect(statusChangeProblem("MISSED", done, "did not attend", today)).toMatch(/on the record/);
    expect(statusChangeProblem("CANCELLED", done, null, today)).toMatch(/on the record/);
    expect(statusChangeProblem("PLANNED", done, null, today)).toMatch(/on the record/);
  });

  it("wants a reason before marking someone missed", () => {
    expect(statusChangeProblem("MISSED", past, null, today)).toMatch(/Say why/);
    expect(statusChangeProblem("MISSED", past, "   ", today)).toMatch(/Say why/);
    expect(statusChangeProblem("MISSED", past, "No show, centre confirmed", today)).toBeNull();
  });

  it("will not mark a future visit missed", () => {
    const future = { hasInspection: false, date: asDate("2026-09-10") };
    expect(statusChangeProblem("MISSED", future, "why", today)).toMatch(/still in the future/);
  });

  it("lets a manager record a visit made on paper", () => {
    expect(statusChangeProblem("DONE", past, null, today)).toBeNull();
  });
});

describe("needsResolving", () => {
  it("is a passed booking with nothing recorded", () => {
    expect(needsResolving({ status: "PLANNED", hasInspection: false, date: asDate("2026-08-20") }, today)).toBe(true);
  });

  it("is not today's, nor a future one", () => {
    expect(needsResolving({ status: "PLANNED", hasInspection: false, date: today }, today)).toBe(false);
    expect(needsResolving({ status: "PLANNED", hasInspection: false, date: asDate("2026-09-01") }, today)).toBe(false);
  });

  it("is not one already settled", () => {
    expect(needsResolving({ status: "DONE", hasInspection: true, date: asDate("2026-08-20") }, today)).toBe(false);
    expect(needsResolving({ status: "MISSED", hasInspection: false, date: asDate("2026-08-20") }, today)).toBe(false);
  });
});

describe("attendance", () => {
  const v = (over: Partial<Parameters<typeof attendance>[0][0]>) => ({
    inspectorId: "i1",
    inspector: "Ola",
    status: "PLANNED" as const,
    hasInspection: false,
    date: asDate("2026-08-20"),
    ...over,
  });

  it("counts done, missed and unresolved separately", () => {
    const [r] = attendance(
      [
        v({ status: "DONE", hasInspection: true }),
        v({ status: "MISSED", date: asDate("2026-08-10") }),
        v({ date: asDate("2026-08-05") }), // passed, nobody has decided
        v({ date: asDate("2026-09-10") }), // still to come
      ],
      today
    );
    expect(r.booked).toBe(4);
    expect(r.done).toBe(1);
    expect(r.missed).toBe(1);
    expect(r.unresolved).toBe(1);
  });

  it("leaves unresolved days out of the rate", () => {
    // A day nobody has looked at is a gap in the paperwork, not a mark against
    // the inspector — counting it would make the number dishonest.
    const [r] = attendance([v({ status: "DONE", hasInspection: true }), v({ date: asDate("2026-08-01") })], today);
    expect(r.rate).toBe(100);
  });

  it("does not count a cancelled visit against anyone", () => {
    const [r] = attendance([v({ status: "CANCELLED" }), v({ status: "DONE", hasInspection: true })], today);
    expect(r.booked).toBe(1);
    expect(r.rate).toBe(100);
  });

  it("has no rate for someone with nothing settled", () => {
    expect(attendance([v({ date: asDate("2026-09-10") })], today)[0].rate).toBeNull();
  });

  it("puts the worst attendance first", () => {
    const rows = attendance(
      [
        v({ inspectorId: "good", inspector: "A", status: "DONE", hasInspection: true }),
        v({ inspectorId: "poor", inspector: "B", status: "MISSED" }),
        v({ inspectorId: "poor", inspector: "B", status: "DONE", hasInspection: true }),
      ],
      today
    );
    expect(rows.map((r) => r.inspectorId)).toEqual(["poor", "good"]);
  });
});
