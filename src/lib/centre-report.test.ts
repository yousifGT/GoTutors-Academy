import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  centre: { findMany: vi.fn() },
  user: { count: vi.fn() },
  enrollment: { count: vi.fn() },
  quizAttempt: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { centreReportRows } from "./centre-report";

beforeEach(() => {
  vi.clearAllMocks();
  db.centre.findMany.mockResolvedValue([{ id: "c1", name: "London" }]);
  db.user.count.mockResolvedValue(5);
  // total enrolments 10, completed 3
  db.enrollment.count.mockImplementation(({ where }: any) => Promise.resolve(where.completed ? 3 : 10));
  // total attempts 8, passes 6
  db.quizAttempt.count.mockImplementation(({ where }: any) => Promise.resolve(where.passed ? 6 : 8));
});

describe("centreReportRows", () => {
  it("aggregates per-centre stats with counts (no row loading)", async () => {
    const rows = await centreReportRows();
    expect(rows).toEqual([
      { id: "c1", name: "London", users: 5, enrolments: 10, completed: 3, passes: 6, fails: 2, passRate: 75 },
    ]);
  });

  it("handles a centre with no attempts (0% pass rate, no divide-by-zero)", async () => {
    db.enrollment.count.mockResolvedValue(0);
    db.quizAttempt.count.mockResolvedValue(0);
    const rows = await centreReportRows();
    expect(rows[0].passRate).toBe(0);
    expect(rows[0].fails).toBe(0);
  });
});
