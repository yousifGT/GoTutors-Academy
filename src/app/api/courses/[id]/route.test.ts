import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  courseRoleAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { COURSE_EDIT: "course.edit", COURSE_DELETE: "course.delete" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { PATCH, DELETE } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

const author = { user: { id: "author1", roleType: "INSTRUCTOR", centreId: null } };
const other = { user: { id: "other1", roleType: "INSTRUCTOR", centreId: null } };
const superAdmin = { user: { id: "sa", roleType: "SUPER_ADMIN", centreId: null } };

function patchReq(body: unknown) {
  return new Request("https://app.test/api/courses/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  db.course.findUnique.mockResolvedValue({ authorId: "author1" });
  db.course.update.mockResolvedValue({ id: "c1", title: "x" });
  db.course.delete.mockResolvedValue({ id: "c1" });
});

describe("PATCH /api/courses/[id] ownership", () => {
  it("403s an instructor who didn't author the course", async () => {
    session.mockResolvedValue(other);
    const res = await PATCH(patchReq({ title: "hijack" }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(db.course.update).not.toHaveBeenCalled();
  });

  it("allows the author", async () => {
    session.mockResolvedValue(author);
    const res = await PATCH(patchReq({ title: "new" }), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.course.update).toHaveBeenCalled();
  });

  it("allows a super admin", async () => {
    session.mockResolvedValue(superAdmin);
    const res = await PATCH(patchReq({ title: "new" }), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.course.update).toHaveBeenCalled();
  });

  it("404s when the course doesn't exist", async () => {
    session.mockResolvedValue(author);
    db.course.findUnique.mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: "new" }), { params: { id: "c1" } });
    expect(res.status).toBe(404);
    expect(db.course.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/courses/[id] ownership", () => {
  it("403s a non-author", async () => {
    session.mockResolvedValue(other);
    const res = await DELETE(new Request("https://app.test/api/courses/c1", { method: "DELETE" }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(db.course.delete).not.toHaveBeenCalled();
  });

  it("lets the author delete", async () => {
    session.mockResolvedValue(author);
    const res = await DELETE(new Request("https://app.test/api/courses/c1", { method: "DELETE" }), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.course.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
