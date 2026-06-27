import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  video: { deleteMany: vi.fn(), upsert: vi.fn() },
  quiz: { upsert: vi.fn() },
  question: { deleteMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
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
import { PATCH } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

function patchReq(body: unknown) {
  return new Request("https://app.test/api/lessons/l1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  // requireLessonAccess resolves the owning course's author through the lesson.
  db.lesson.findUnique.mockResolvedValue({ module: { course: { authorId: "author1" } } });
});

describe("PATCH /api/lessons/[id] ownership (nested)", () => {
  it("403s an instructor editing a lesson in a course they didn't author", async () => {
    session.mockResolvedValue({ user: { id: "other1", roleType: "INSTRUCTOR" } });
    const res = await PATCH(patchReq({ title: "hijack" }), { params: { id: "l1" } });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
