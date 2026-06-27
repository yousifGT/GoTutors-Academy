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
  db.lesson.update.mockResolvedValue({ id: "l1" });
  db.quiz.upsert.mockResolvedValue({ id: "q1" });
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
});

const author = { user: { id: "author1", roleType: "INSTRUCTOR" } };

describe("PATCH /api/lessons/[id] ownership (nested)", () => {
  it("403s an instructor editing a lesson in a course they didn't author", async () => {
    session.mockResolvedValue({ user: { id: "other1", roleType: "INSTRUCTOR" } });
    const res = await PATCH(patchReq({ title: "hijack" }), { params: { id: "l1" } });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/lessons/[id] preserves quiz questions", () => {
  it("does NOT delete questions on a metadata-only quiz edit", async () => {
    session.mockResolvedValue(author);
    const res = await PATCH(patchReq({ quiz: { passThreshold: 80 } }), { params: { id: "l1" } });
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).not.toHaveBeenCalled();
    expect(db.question.create).not.toHaveBeenCalled();
    // metadata is updated, not reset to defaults
    expect(db.quiz.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { passThreshold: 80 } })
    );
  });

  it("rewrites questions only when a list is sent", async () => {
    session.mockResolvedValue(author);
    const res = await PATCH(
      patchReq({
        quiz: {
          questions: [
            { type: "MULTIPLE_CHOICE", prompt: "Q1", answers: [{ text: "a", isCorrect: true }] },
          ],
        },
      }),
      { params: { id: "l1" } }
    );
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).toHaveBeenCalledWith({ where: { quizId: "q1" } });
    expect(db.question.create).toHaveBeenCalledTimes(1);
  });

  it("clears questions on an explicit empty array", async () => {
    session.mockResolvedValue(author);
    const res = await PATCH(patchReq({ quiz: { questions: [] } }), { params: { id: "l1" } });
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).toHaveBeenCalledWith({ where: { quizId: "q1" } });
    expect(db.question.create).not.toHaveBeenCalled();
  });

  it("does not wipe lesson content when content is omitted", async () => {
    session.mockResolvedValue(author);
    await PATCH(patchReq({ title: "New title" }), { params: { id: "l1" } });
    expect(db.lesson.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { title: "New title" } });
  });
});
