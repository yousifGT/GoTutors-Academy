import { describe, it, expect } from "vitest";
import { OVERDUE_DAYS, canScheduleVisits, coverage, daysBetween, asDate } from "./schedule";

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
