import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  subPosition: { findMany: vi.fn() },
  enrollment: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { syncCourseEnrollments, syncUserEnrollments } from "./auto-enrol";

beforeEach(() => {
  vi.clearAllMocks();
  db.enrollment.createMany.mockImplementation(async ({ data }: any) => ({ count: data.length }));
  // The fields that exist, used to map stored tutor titles back to field names.
  db.subPosition.findMany.mockResolvedValue([
    { name: "English Tutor" },
    { name: "Maths Tutor" },
    { name: "Head of Centre" },
  ]);
});

describe("syncCourseEnrollments", () => {
  it("does nothing for a draft course", async () => {
    db.course.findUnique.mockResolvedValue({ id: "c1", published: false, roleAssignments: [] });
    expect(await syncCourseEnrollments("c1")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });

  // The heads-of-centre course: assigned to an admin role, it used to reach
  // nobody because only trainee roles were ever enrolled.
  it("enrols everyone on a non-trainee role the course is assigned to", async () => {
    db.course.findUnique.mockResolvedValue({
      id: "c1",
      published: true,
      roleAssignments: [{ roleId: "admin-role", subPosition: null, role: { type: "CENTRE_ADMIN" } }],
    });
    db.user.findMany.mockResolvedValue([{ id: "head1" }, { id: "head2" }]);

    expect(await syncCourseEnrollments("c1")).toBe(2);
    expect(db.user.findMany.mock.calls[0][0].where.OR).toEqual([{ roleId: "admin-role" }]);
  });

  // Older data: the course form used to attach the trainee sub-positions to
  // every selected role, admin roles included. A field means nothing on an
  // admin role, so the row is read as the whole role it names.
  it("treats a field attached to a non-trainee role as the whole role", async () => {
    db.course.findUnique.mockResolvedValue({
      id: "c1",
      published: true,
      roleAssignments: [
        { roleId: "trainee-role", subPosition: "Maths Tutor", role: { type: "TRAINEE" } },
        { roleId: "admin-role", subPosition: "Maths Tutor", role: { type: "CENTRE_ADMIN" } },
      ],
    });
    db.user.findMany.mockResolvedValue([]);

    await syncCourseEnrollments("c1");
    const or = db.user.findMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ roleId: "admin-role" });
    // The trainee row keeps its field — only the admin row widens.
    expect(or).not.toContainEqual({ roleId: "trainee-role" });
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
        role: { type: { in: ["TRAINEE", "INSTRUCTOR"] } },
        OR: [
          { subPositions: { hasSome: ["English Tutor", "Maths Tutor"] } },
          { subPosition: { in: ["English Tutor", "Maths Tutor"] } },
          { teacherPositions: { hasSome: ["English Tutor", "Maths Tutor"] } },
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
  it("does nothing for an inactive user", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", active: false, subPosition: null, subPositions: [], role: { type: "TRAINEE" } });
    expect(await syncUserEnrollments("u1")).toBe(0);
    expect(db.course.findMany).not.toHaveBeenCalled();
  });

  it("enrols a head of centre into every course assigned to their role", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", active: true, roleId: "admin-role", subPosition: null, subPositions: [], role: { type: "CENTRE_ADMIN" },
    });
    db.course.findMany.mockResolvedValue([{ id: "c1" }]);

    expect(await syncUserEnrollments("u1")).toBe(1);
    // Every row on their role counts — a field on an admin role means nothing —
    // and training fields are never consulted for an admin.
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some).toEqual({
      OR: [{ roleId: "admin-role" }],
    });
    expect(db.subPosition.findMany).not.toHaveBeenCalled();
  });

  it("enrols a pure instructor into courses assigned to their role", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1", active: true, roleId: "instructor-role", subPosition: null, subPositions: [], role: { type: "INSTRUCTOR" },
    });
    db.course.findMany.mockResolvedValue([]);

    await syncUserEnrollments("u1");
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some).toEqual({
      OR: [{ roleId: "instructor-role" }],
    });
  });

  it("a promoted tutor/instructor still receives courses for their remaining trainee fields", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      active: true,
      roleId: "instructor-role",
      subPosition: null,
      subPositions: ["English Tutor"], // still in training for English
      role: { type: "INSTRUCTOR" },
    });
    db.course.findMany.mockResolvedValue([{ id: "c1" }]);

    expect(await syncUserEnrollments("u1")).toBe(1);

    // Their own role's courses, plus their field matched through any trainee
    // role's assignments — never the trainee role's whole-role courses.
    expect(db.course.findMany.mock.calls[0][0].where.roleAssignments.some).toEqual({
      OR: [{ roleId: "instructor-role" }, { role: { type: "TRAINEE" }, subPosition: { in: ["English Tutor"] } }],
    });
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
    expect(where.roleAssignments.some.OR).toEqual([
      { roleId: "trainee-role", subPosition: null },
      { role: { type: "TRAINEE" }, subPosition: { in: ["Maths Tutor", "English Tutor"] } },
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
      { roleId: "trainee-role", subPosition: null },
    ]);
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });
});

// The gap this closes: promotion moves a completed field out of subPositions into
// teacherPositions, so a tutor matched nothing and a newly published course in
// their own field never reached them — silently, with no way to complete it.
describe("syncUserEnrollments for a promoted tutor", () => {
  it("enrols them into a new course in a field they tutor", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "t1",
      active: true,
      roleId: "tutor-role",
      subPosition: null,
      subPositions: [],
      teacherPositions: ["Maths Tutor"],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([{ id: "new-maths" }]);

    expect(await syncUserEnrollments("t1")).toBe(1);
    const assignmentOr = db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR;
    expect(assignmentOr).toEqual(
      expect.arrayContaining([{ role: { type: "TRAINEE" }, subPosition: { in: ["Maths Tutor"] } }])
    );
    expect(db.enrollment.createMany).toHaveBeenCalledWith({
      data: [{ userId: "t1", courseId: "new-maths" }],
      skipDuplicates: true,
    });
  });

  it("covers training and tutored fields together, without duplicates", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "t2",
      active: true,
      roleId: "tutor-role",
      subPosition: null,
      subPositions: ["English Tutor"],
      teacherPositions: ["Maths Tutor"],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([]);

    await syncUserEnrollments("t2");
    const assignmentOr = db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR;
    const subMatch = assignmentOr.find((c: any) => c.subPosition);
    expect(subMatch.subPosition.in.sort()).toEqual(["English Tutor", "Maths Tutor"]);
  });

  // "Head of Centre" is stored as "Head of Centre Tutor", so a naive reverse of
  // the transform would look for a field that doesn't exist.
  it("maps a title back to its field when the two differ", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "t3",
      active: true,
      roleId: "tutor-role",
      subPosition: null,
      subPositions: [],
      teacherPositions: ["Head of Centre Tutor"],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([]);

    await syncUserEnrollments("t3");
    const assignmentOr = db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR;
    expect(assignmentOr.find((c: any) => c.subPosition).subPosition.in).toEqual(["Head of Centre"]);
  });

  it("ignores a title whose field no longer exists", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "t4",
      active: true,
      roleId: "tutor-role",
      subPosition: null,
      subPositions: [],
      teacherPositions: ["Deleted Field Tutor"],
      role: { type: "TRAINEE" },
    });
    db.course.findMany.mockResolvedValue([]);

    await syncUserEnrollments("t4");
    const assignmentOr = db.course.findMany.mock.calls[0][0].where.roleAssignments.some.OR;
    expect(assignmentOr.some((c: any) => c.subPosition)).toBe(false);
  });
});
