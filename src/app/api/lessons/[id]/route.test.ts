import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  video: { deleteMany: vi.fn(), upsert: vi.fn() },
  quiz: { upsert: vi.fn(), findUnique: vi.fn() },
  question: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  quizAttempt: { count: vi.fn() },
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
  // The lesson already has a quiz unless a test says otherwise.
  db.quiz.findUnique.mockResolvedValue({ id: "q1" });
  // No stored questions and nothing awaiting review, unless a test says otherwise.
  db.question.findMany.mockResolvedValue([]);
  db.quizAttempt.count.mockResolvedValue(0);
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
    // There has to be something stored for [] to be a change rather than a no-op.
    db.question.findMany.mockResolvedValue([
      { type: "OPEN_ENDED", prompt: "Why?", points: 1, answers: [] },
    ]);
    const res = await PATCH(patchReq({ quiz: { questions: [] } }), { params: { id: "l1" } });
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).toHaveBeenCalledWith({ where: { quizId: "q1" } });
    expect(db.question.create).not.toHaveBeenCalled();
  });

  // The editor sends its quiz settings on every save. A lesson saved just to add
  // a video used to get an empty quiz, which then blocked publishing the course.
  it("does not create a quiz for a lesson saved with no questions", async () => {
    session.mockResolvedValue(author);
    db.quiz.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      patchReq({ title: "Intro", quiz: { passThreshold: 70, retryLimit: 3, questions: [] } }),
      { params: { id: "l1" } }
    );
    expect(res.status).toBe(200);
    expect(db.quiz.upsert).not.toHaveBeenCalled();
    expect(db.question.create).not.toHaveBeenCalled();
    // The rest of the save still happens.
    expect(db.lesson.update).toHaveBeenCalledWith(expect.objectContaining({ data: { title: "Intro" } }));
  });

  it("does not create a quiz from settings alone", async () => {
    session.mockResolvedValue(author);
    db.quiz.findUnique.mockResolvedValue(null);
    await PATCH(patchReq({ quiz: { passThreshold: 80 } }), { params: { id: "l1" } });
    expect(db.quiz.upsert).not.toHaveBeenCalled();
  });

  it("creates the quiz once a question is added", async () => {
    session.mockResolvedValue(author);
    db.quiz.findUnique.mockResolvedValue(null);
    await PATCH(
      patchReq({ quiz: { questions: [{ type: "MULTIPLE_CHOICE", prompt: "Q1", answers: [{ text: "a", isCorrect: true }] }] } }),
      { params: { id: "l1" } }
    );
    expect(db.quiz.upsert).toHaveBeenCalledTimes(1);
    expect(db.question.create).toHaveBeenCalledTimes(1);
  });

  it("skips the rewrite when an empty list is resubmitted over no questions", async () => {
    session.mockResolvedValue(author);
    const res = await PATCH(patchReq({ quiz: { questions: [] } }), { params: { id: "l1" } });
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).not.toHaveBeenCalled();
  });

  it("does not wipe lesson content when content is omitted", async () => {
    session.mockResolvedValue(author);
    await PATCH(patchReq({ title: "New title" }), { params: { id: "l1" } });
    expect(db.lesson.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { title: "New title" } });
  });
});

describe("PATCH /api/lessons/[id] protects attempts awaiting review", () => {
  const question = {
    type: "MULTIPLE_CHOICE",
    prompt: "2 + 2?",
    points: 1,
    answers: [{ text: "4", isCorrect: true }],
  };

  beforeEach(() => {
    session.mockResolvedValue({ user: { id: "author1", roleType: "INSTRUCTOR" } });
    db.question.findMany.mockResolvedValue([question]);
  });

  // The editor resends the whole list on every save, so a title-only edit used
  // to delete and recreate every question and answer.
  it("does not touch questions when the list is unchanged", async () => {
    db.quizAttempt.count.mockResolvedValue(2);
    const res = await PATCH(
      patchReq({ title: "New title", quiz: { questions: [{ type: "MULTIPLE_CHOICE", prompt: "2 + 2?", answers: [{ text: "4", isCorrect: true }] }] } }),
      { params: { id: "l1" } }
    );
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).not.toHaveBeenCalled();
    expect(db.question.create).not.toHaveBeenCalled();
  });

  it("409s a genuine question edit while an attempt awaits review", async () => {
    db.quizAttempt.count.mockResolvedValue(1);
    const res = await PATCH(
      patchReq({ quiz: { questions: [{ type: "MULTIPLE_CHOICE", prompt: "2 + 3?", answers: [{ text: "5", isCorrect: true }] }] } }),
      { params: { id: "l1" } }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/awaiting review/);
    expect(db.question.deleteMany).not.toHaveBeenCalled();
  });

  it("allows the same edit once nothing is awaiting review", async () => {
    db.quizAttempt.count.mockResolvedValue(0);
    const res = await PATCH(
      patchReq({ quiz: { questions: [{ type: "MULTIPLE_CHOICE", prompt: "2 + 3?", answers: [{ text: "5", isCorrect: true }] }] } }),
      { params: { id: "l1" } }
    );
    expect(res.status).toBe(200);
    expect(db.question.deleteMany).toHaveBeenCalled();
    expect(db.question.create).toHaveBeenCalledTimes(1);
  });
});
