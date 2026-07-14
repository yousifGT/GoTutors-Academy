import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findMany: vi.fn() },
  progress: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getCourseProgressForUsers } from "./course-progress";

beforeEach(() => vi.clearAllMocks());

describe("getCourseProgressForUsers", () => {
  it("returns an empty map (and runs no queries) for no pairs", async () => {
    const out = await getCourseProgressForUsers([]);
    expect(out.size).toBe(0);
    expect(db.lesson.findMany).not.toHaveBeenCalled();
  });

  it("computes per-user percentages in two queries", async () => {
    db.lesson.findMany.mockResolvedValue([
      { id: "l1", module: { courseId: "c1" } },
      { id: "l2", module: { courseId: "c1" } },
    ]);
    db.progress.findMany.mockResolvedValue([{ userId: "u1", lessonId: "l1" }]);

    const out = await getCourseProgressForUsers([
      { userId: "u1", courseId: "c1" },
      { userId: "u2", courseId: "c1" },
    ]);

    expect(out.get("u1:c1")).toEqual({ total: 2, completed: 1, percent: 50 });
    expect(out.get("u2:c1")).toEqual({ total: 2, completed: 0, percent: 0 });
    // one lessons query + one progress query, regardless of pair count
    expect(db.lesson.findMany).toHaveBeenCalledTimes(1);
    expect(db.progress.findMany).toHaveBeenCalledTimes(1);
  });
});
