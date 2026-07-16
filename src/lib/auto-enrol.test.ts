import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  enrollment: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { syncCourseEnrollments, syncUserEnrollments } from "./auto-enrol";

beforeEach(() => {
  vi.clearAllMocks();
  db.enrollment.createMany.mockImplementation(async ({ data }: any) => ({ count: data.length }));
});

describe("syncCourseEnrollments", () => {
  it("does nothing for a draft course", async () => {
    db.course.findUnique.mockResolvedValue({ id: "c1", published: false, roleAssignments: [] });
    expect(await syncCourseEnrollments("c1")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });

  it("ignores assignments to non-trainee roles", async () => {
    db.course.findUnique.mockResolvedValue({
      id: "c1",
      published: true,
      roleAssignments: [{ roleId: "admin-role", subPosition: null, role: { type: "CENTRE_ADMIN" } }],
    });
    expect(await syncCourseEnrollments("c1")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("enrols matching trainees by sub-position (array or legacy single)", async () => {
    db.course.findUnique.mockResolvedValue({
      id: "c1",
      published: true,
      roleAssignments: [
        { roleId: "trainee-role", subPosition: "English Tutor", role: { type: "TRAINEE" } },
        { roleId: "trainee-role", subPosition: "Maths Tutor", role: { type: "TRAINEE" } },
      ],
    });
    db.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);

    expect(await syncCourseEnrollments("c1")).toBe(2);

    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.enrollments).toEqual({ none: { courseId: "c1" } });
    expect(where.OR).toEqual([
      {
        roleId: "trainee-role",
        OR: [
          { subPositions: { hasSome: ["English Tutor", "Maths Tutor"] } },
          { subPosition: { in: ["English Tutor", "Maths Tutor"] } },
        ],
      },
    ]);
    expect(db.enrollment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", courseId: "c1" },
        { userId: "u2", courseId: "c1" },
      ],
      skipDuplicates: true,
    });
  });

  it("a role-wide assignment (no sub-position) matches every trainee with the role", async () => {
    db.course.findUnique.mockResolvedValue({
      id: "c1",
      published: true,
      roleAssignments: [
        { roleId: "trainee-role", subPosition: null, role: { type: "TRAINEE" } },
        { roleId: "trainee-role", subPosition: "Maths Tutor", role: { type: "TRAINEE" } },
      ],
    });
    db.user.findMany.mockResolvedValue([]);

    await syncCourseEnrollments("c1");
    // The null assignment widens the match to the whole role.
    expect(db.user.findMany.mock.calls[0][0].where.OR).toEqual([{ roleId: "trainee-role" }]);
  });
});

describe("syncUserEnrollments", () => {
  it("does nothing for non-trainees or inactive users", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: { type: "INSTRUCTOR" } });
    expect(await syncUserEnrollments("u1")).toBe(0);

    db.user.findUnique.mockResolvedValue({ id: "u1", active: false, role: { type: "TRAINEE" } });
    expect(await syncUserEnrollments("u1")).toBe(0);
    expect(db.course.findMany).not.toHaveBeenCalled();
  });

  it("enrols a trainee into every published course matching any of their sub-positions", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      active: true,
      roleId: "trainee-role",
      subPosition: "English Tutor", // legacy column still honoured
      subPositions: ["Maths Tutor"],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

    expect(await syncUserEnrollments("u1")).toBe(2);

    const where = db.course.findMany.mock.calls[0][0].where;
    expect(where.published).toBe(true);
    expect(where.enrollments).toEqual({ none: { userId: "u1" } });
    expect(where.roleAssignments.some.roleId).toBe("trainee-role");
    expect(where.roleAssignments.some.OR).toEqual([
      { subPosition: null },
      { subPosition: { in: ["Maths Tutor", "English Tutor"] } },
    ]);
    expect(db.enrollment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", courseId: "c1" },
        { userId: "u1", courseId: "c2" },
      ],
      skipDuplicates: true,
    });
  });

  it("a trainee with no sub-positions still receives role-wide courses", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      active: true,
      roleId: "trainee-role",
      subPosition: null,
      subPositions: [],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([]);

    expect(await syncUserEnrollments("u1")).toBe(0);
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR).toEqual([
      { subPosition: null },
    ]);
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });
});
