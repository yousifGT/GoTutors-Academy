import { describe, expect, it } from "vitest";
import { progressFor, streak, trend, type Visit, type VisitAnswer } from "./progress";

const a = (questionText: string, bucket: VisitAnswer["bucket"], critical = false): VisitAnswer => ({
  questionText,
  bucket,
  critical,
});
const visit = (id: string, day: number, scorePct: number | null, answers: VisitAnswer[]): Visit => ({
  id,
  date: new Date(Date.UTC(2026, 0, day)),
  scorePct,
  verdict: null,
  inspector: "Tom Beckett",
  answers,
});

describe("with nothing to compare against", () => {
  it("says so rather than inventing a comparison", () => {
    const p = progressFor([]);
    expect(p.latest).toBeNull();
    expect(p.movement).toBeNull();
    expect(p.scoreChange).toBeNull();
  });

  it("still lists what a first visit flagged", () => {
    const p = progressFor([visit("v1", 10, 70, [a("Fire exits", "IMPROVE", true), a("Signage", "WELL")])]);
    expect(p.movement).toBeNull();
    expect(p.outstanding.map((f) => f.question)).toEqual(["Fire exits"]);
    expect(p.criticalNow.map((f) => f.question)).toEqual(["Fire exits"]);
  });
});

describe("what moved since the last visit", () => {
  const previous = visit("v1", 10, 70, [
    a("Fire exits", "IMPROVE", true),
    a("Toilets", "IMPROVE"),
    a("Signage", "IMPROVE"),
    a("Stock", "IMPROVE"),
    a("Welcome", "WELL"),
  ]);
  const latest = visit("v2", 20, 78, [
    a("Fire exits", "WELL", true), // put right
    a("Toilets", "IMPROVE"), // still wrong
    a("Signage", null), // not answered this time
    // "Stock" is not on this visit's checklist at all
    a("Welcome", "IMPROVE"), // new
  ]);
  const p = progressFor([latest, previous]);

  it("says what has been put right", () => {
    expect(p.movement?.fixed.map((f) => f.question)).toEqual(["Fire exits"]);
  });

  it("says what is still wrong", () => {
    expect(p.movement?.stillWrong.map((f) => f.question)).toEqual(["Toilets"]);
  });

  it("says what is new", () => {
    expect(p.movement?.fresh.map((f) => f.question)).toEqual(["Welcome"]);
  });

  it("keeps what nobody looked at again out of the good news", () => {
    // Unanswered and dropped-from-the-checklist both land here. Counting either
    // as fixed would report progress that never happened.
    expect(p.movement?.unchecked.map((f) => f.question).sort()).toEqual(["Signage", "Stock"]);
    expect(p.movement?.fixed.map((f) => f.question)).not.toContain("Signage");
    expect(p.movement?.fixed.map((f) => f.question)).not.toContain("Stock");
  });

  it("reports the change in score", () => {
    expect(p.scoreChange).toBe(8);
  });

  it("lists everything still flagged, critical first", () => {
    expect(p.outstanding.map((f) => f.question)).toEqual(["Toilets", "Welcome"]);
  });
});

describe("how long something has been outstanding", () => {
  const v3 = visit("v3", 30, 60, [a("Toilets", "IMPROVE"), a("Fire exits", "IMPROVE", true)]);
  const v2 = visit("v2", 20, 65, [a("Toilets", "IMPROVE"), a("Fire exits", "WELL", true)]);
  const v1 = visit("v1", 10, 70, [a("Toilets", "IMPROVE"), a("Fire exits", "IMPROVE", true)]);
  const visits = [v3, v2, v1];

  it("counts the run back from the newest visit", () => {
    expect(streak("Toilets", visits)).toBe(3);
  });

  it("stops at the visit that did not flag it, rather than counting every time it ever appeared", () => {
    // Fire exits was flagged at v1 and again at v3, but it was clean at v2. It
    // is one visit old, not two: it was fixed and came back.
    expect(streak("Fire exits", visits)).toBe(1);
  });

  it("stops at a visit that did not ask it at all", () => {
    const gap = [v3, visit("gap", 25, 80, []), v2, v1];
    expect(streak("Toilets", gap)).toBe(1);
  });

  it("puts the critical item first and the longest-running above the rest", () => {
    const p = progressFor(visits);
    expect(p.outstanding.map((f) => [f.question, f.visits])).toEqual([
      ["Fire exits", 1],
      ["Toilets", 3],
    ]);
  });

  it("gives something just fixed a run of zero", () => {
    const p = progressFor([v2, v1]);
    expect(p.movement?.fixed).toEqual([{ question: "Fire exits", critical: true, visits: 0 }]);
  });
});

describe("trend", () => {
  it("runs oldest to newest, and leaves out visits with no score", () => {
    const t = trend([visit("c", 30, 80, []), visit("b", 20, null, []), visit("a", 10, 70, [])]);
    expect(t.map((p) => [p.id, p.pct])).toEqual([
      ["a", 70],
      ["c", 80],
    ]);
  });
});
