import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  subPosition: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  courseRoleAssignment: { deleteMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: () => undefined }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { getServerSession } from "next-auth";
import { DELETE, PATCH } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;

function req(body?: unknown) {
  return new Request("https://app.test/api/admin/sub-positions/sp1", {
    method: body ? "PATCH" : "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN" } });
  // The route calls findUnique twice: once by id for the field itself, once by
  // roleId_name for the duplicate check. Answer them separately or every rename
  // looks like a duplicate.
  db.subPosition.findUnique.mockImplementation(async ({ where }: any) =>
    where.roleId_name
      ? null
      : { id: "sp1", name: "Maths Trainee", roleId: "traineeRole", role: { name: "Trainee" } }
  );
  db.subPosition.findMany.mockResolvedValue([{ name: "Maths Trainee" }, { name: "English Trainee" }]);
  db.user.count.mockResolvedValue(0);
  db.user.findMany.mockResolvedValue([]);
  db.$transaction.mockResolvedValue([]);
});

describe("DELETE — the field cannot be deleted out from under its holders", () => {
  it("refuses when someone is still training in it", async () => {
    db.user.count.mockImplementation(async ({ where }: any) => (where.OR ? 3 : 0));
    const res = await DELETE(req(), { params: { id: "sp1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/3 in training/);
    expect(db.subPosition.delete).not.toHaveBeenCalled();
    expect(db.courseRoleAssignment.deleteMany).not.toHaveBeenCalled();
  });

  // The bug: promotion moves people to the Tutor role and stores the field as a
  // TITLE, so a guard reading only subPositions on the field's own role saw zero.
  it("refuses when someone is qualified to tutor it", async () => {
    db.user.count.mockImplementation(async ({ where }: any) => (where.teacherPositions ? 2 : 0));
    const res = await DELETE(req(), { params: { id: "sp1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/2 qualified to tutor it/);
    expect(db.subPosition.delete).not.toHaveBeenCalled();
  });

  it("counts tutors by the field's title, not its name", async () => {
    await DELETE(req(), { params: { id: "sp1" } });
    const titleQuery = db.user.count.mock.calls.map(([a]: any) => a).find((a: any) => a.where.teacherPositions);
    expect(titleQuery.where.teacherPositions).toEqual({ has: "Maths Tutor" });
  });

  it("is not scoped to the field's own role", async () => {
    await DELETE(req(), { params: { id: "sp1" } });
    for (const [arg] of db.user.count.mock.calls as any) {
      expect(arg.where.roleId).toBeUndefined();
    }
  });

  it("deletes when genuinely unused", async () => {
    const res = await DELETE(req(), { params: { id: "sp1" } });
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
  });
});

describe("PATCH — renaming carries the tutor title with it", () => {
  it("rewrites teacherPositions when the title changes", async () => {
    db.user.findMany.mockImplementation(async ({ where }: any) =>
      where.teacherPositions ? [{ id: "u1", teacherPositions: ["Maths Tutor", "English Tutor"] }] : []
    );
    const res = await PATCH(req({ name: "Numeracy Trainee" }), { params: { id: "sp1" } });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { teacherPositions: ["Numeracy Tutor", "English Tutor"] },
    });
  });

  // "Maths Trainee" -> "Maths Tutor" is title-preserving, so nothing to rewrite.
  it("does not touch tutors when the title is unchanged", async () => {
    const res = await PATCH(req({ name: "Maths Tutor" }), { params: { id: "sp1" } });
    expect(res.status).toBe(200);
    const titleLookup = db.user.findMany.mock.calls.find(([a]: any) => a.where.teacherPositions);
    expect(titleLookup).toBeUndefined();
  });

  it("refuses a rename that would collide with another field's title", async () => {
    db.subPosition.findMany.mockResolvedValue([{ name: "Maths Trainee" }, { name: "History Tutor" }]);
    const res = await PATCH(req({ name: "History" }), { params: { id: "sp1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/History Tutor/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
