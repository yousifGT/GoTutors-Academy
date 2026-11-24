import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  course: { findMany: vi.fn() },
  subPosition: { findMany: vi.fn() },
  coursePrerequisite: { findMany: vi.fn() },
  enrollment: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { canLearn, entitledCourseIds, prerequisiteClosure } from "./learner-access";

const head = { id: "h1", roleId: "admin-role", active: true, subPosition: null, subPositions: [], teacherPositions: [], role: { type: "CENTRE_ADMIN" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.subPosition.findMany.mockResolvedValue([{ name: "Maths Tutor" }]);
  db.coursePrerequisite.findMany.mockResolvedValue([]);
  db.enrollment.findUnique.mockResolvedValue({ userId: "h1" });
});

describe("canLearn", () => {
  it("opens a course that is enrolled and still assigned", async () => {
    db.user.findUnique.mockResolvedValue(head);
    db.course.findMany.mockResolvedValue([{ id: "admin-course" }]);
    expect(await canLearn({ id: "h1", roleType: "CENTRE_ADMIN" }, "admin-course")).toBe(true);
  });

  // The reported bug: admin role removed, enrolment kept, course still open.
  it("refuses a course still enrolled but no longer assigned to their role", async () => {
    db.user.findUnique.mockResolvedValue({ ...head, roleId: "trainee-role", role: { type: "TRAINEE" } });
    db.course.findMany.mockResolvedValue([]); // nothing assigned to the trainee role
    expect(await canLearn({ id: "h1", roleType: "TRAINEE" }, "admin-course")).toBe(false);
    // ...and the match is against the role they hold NOW.
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR[0]).toEqual({
      roleId: "trainee-role",
      subPosition: null,
    });
  });

  it("refuses an assigned course they are not enrolled in", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    expect(await canLearn({ id: "h1", roleType: "CENTRE_ADMIN" }, "admin-course")).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses everything to a deactivated person", async () => {
    db.user.findUnique.mockResolvedValue({ ...head, active: false });
    expect(await canLearn({ id: "h1", roleType: "CENTRE_ADMIN" }, "admin-course")).toBe(false);
  });

  it("lets a super admin preview any course", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    expect(await canLearn({ id: "sa", roleType: "SUPER_ADMIN" }, "anything")).toBe(true);
  });
});

describe("entitledCourseIds", () => {
  // Self-enrolment is gone, so a prerequisite assigned to nobody must open with
  // the course it unlocks, or that course stays locked forever.
  it("includes the prerequisites of assigned courses, transitively", async () => {
    db.user.findUnique.mockResolvedValue(head);
    db.course.findMany.mockResolvedValue([{ id: "c3" }]);
    db.coursePrerequisite.findMany
      .mockResolvedValueOnce([{ prerequisiteId: "c2" }])
      .mockResolvedValueOnce([{ prerequisiteId: "c1" }])
      .mockResolvedValueOnce([]);
    expect([...(await entitledCourseIds("h1"))].sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("matches a trainee's fields by name across trainee roles", async () => {
    db.user.findUnique.mockResolvedValue({
      ...head, roleId: "trainee-role", subPositions: ["Maths Tutor"], role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([]);
    await entitledCourseIds("h1");
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR).toEqual([
      { roleId: "trainee-role", subPosition: null },
      { role: { type: "TRAINEE" }, subPosition: { in: ["Maths Tutor"] } },
    ]);
  });
});

describe("prerequisiteClosure", () => {
  it("stops on a cycle in older data", async () => {
    db.coursePrerequisite.findMany
      .mockResolvedValueOnce([{ prerequisiteId: "b" }])
      .mockResolvedValueOnce([{ prerequisiteId: "a" }]);
    expect(await prerequisiteClosure(["a"])).toEqual(["b"]);
  });
});
