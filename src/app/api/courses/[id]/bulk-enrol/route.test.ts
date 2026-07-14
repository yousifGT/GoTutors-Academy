import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  enrollment: { findMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notify", () => ({ notifyCentreAndInstructor: vi.fn() }));

import { getServerSession } from "next-auth";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;

function req(userIds: string[]) {
  return new Request("https://app.test/api/courses/c1/bulk-enrol", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.course.findUnique.mockResolvedValue({ id: "c1", title: "Course", authorId: "author1", published: true });
  db.user.findMany.mockResolvedValue([
    { id: "u1", name: "A", centreId: "london" },
    { id: "u2", name: "B", centreId: null },
  ]);
  db.enrollment.findMany.mockResolvedValue([]);
  db.enrollment.createMany.mockResolvedValue({ count: 2 });
});

describe("POST /api/courses/[id]/bulk-enrol", () => {
  it("403s a trainee", async () => {
    session.mockResolvedValue({ user: { id: "t", roleType: "TRAINEE", centreId: "london" } });
    const res = await POST(req(["u1"]), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });

  it("blocks a centre admin enrolling into an unpublished course (400)", async () => {
    db.course.findUnique.mockResolvedValue({ id: "c1", title: "Course", authorId: "author1", published: false });
    session.mockResolvedValue({ user: { id: "ca", roleType: "CENTRE_ADMIN", centreId: "london" } });
    const res = await POST(req(["u1"]), { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(db.enrollment.createMany).not.toHaveBeenCalled();
  });

  it("lets the author enrol into their own unpublished course", async () => {
    db.course.findUnique.mockResolvedValue({ id: "c1", title: "Course", authorId: "author1", published: false });
    db.user.findMany.mockResolvedValue([{ id: "u1", name: "A", centreId: "london" }]);
    db.enrollment.createMany.mockResolvedValue({ count: 1 });
    session.mockResolvedValue({ user: { id: "author1", roleType: "INSTRUCTOR", centreId: "london" } });
    const res = await POST(req(["u1"]), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.enrollment.createMany).toHaveBeenCalled();
  });

  it("enrols new users in one createMany and reports the count", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN", centreId: null } });
    const res = await POST(req(["u1", "u2"]), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(2);
    expect(db.enrollment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });
});
