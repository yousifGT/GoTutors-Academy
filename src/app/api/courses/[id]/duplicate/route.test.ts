import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { COURSE_CREATE: "course.create" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

const src = {
  authorId: "author1",
  title: "T",
  description: null,
  thumbnail: null,
  passThreshold: 70,
  roleAssignments: [],
  modules: [],
};

function req() {
  return new Request("https://app.test/api/courses/c1/duplicate", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  db.course.findUnique.mockResolvedValue(src);
  db.course.create.mockResolvedValue({ id: "copy1" });
});

describe("POST /api/courses/[id]/duplicate ownership", () => {
  it("403s an instructor duplicating someone else's course", async () => {
    session.mockResolvedValue({ user: { id: "other1", roleType: "INSTRUCTOR" } });
    const res = await POST(req(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(db.course.create).not.toHaveBeenCalled();
  });

  it("lets the author duplicate their own course", async () => {
    session.mockResolvedValue({ user: { id: "author1", roleType: "INSTRUCTOR" } });
    const res = await POST(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.course.create).toHaveBeenCalled();
  });

  it("lets a super admin duplicate any course", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    const res = await POST(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.course.create).toHaveBeenCalled();
  });
});
