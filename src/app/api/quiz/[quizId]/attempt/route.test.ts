import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  quiz: { findUnique: vi.fn() },
  progress: { findUnique: vi.fn(), upsert: vi.fn() },
  quizAttempt: { findMany: vi.fn(), create: vi.fn() },
  enrollment: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/csrf", () => ({ assertSameOrigin: vi.fn(() => undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, retryAfterSec: 0 })),
  tooMany: vi.fn(() => new Response("rl", { status: 429 })),
}));
vi.mock("@/lib/notify", () => ({ notifyCentreAndInstructor: vi.fn() }));
vi.mock("@/lib/certificate", () => ({ maybeAwardCertificate: vi.fn() }));
vi.mock("@/lib/course-progress", () => ({ isLessonUnlocked: vi.fn() }));

import { getServerSession } from "next-auth";
import { maybeAwardCertificate } from "@/lib/certificate";
import { isLessonUnlocked } from "@/lib/course-progress";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const award = maybeAwardCertificate as unknown as ReturnType<typeof vi.fn>;
const unlocked = isLessonUnlocked as unknown as ReturnType<typeof vi.fn>;

const quiz = {
  id: "q1",
  lessonId: "l1",
  passThreshold: 70,
  retryLimit: 3,
  questions: [
    { id: "qq1", type: "MULTIPLE_CHOICE", points: 1, answers: [{ id: "a1", isCorrect: true }, { id: "a2", isCorrect: false }] },
  ],
  lesson: { title: "Lesson", module: { courseId: "c1", course: { id: "c1", title: "Course" } } },
};

function req(answers: Record<string, string> = {}) {
  return new Request("https://app.test/api/quiz/q1/attempt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "u1", roleType: "TRAINEE" } });
  db.quiz.findUnique.mockResolvedValue(quiz);
  db.progress.findUnique.mockResolvedValue({ videoWatched: true });
  db.quizAttempt.create.mockResolvedValue({ id: "att1" });
  db.progress.upsert.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ name: "T", centreId: null });
  db.enrollment.findUnique.mockResolvedValue({ userId: "u1" });
  unlocked.mockResolvedValue(true);
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
});

describe("POST quiz attempt — access gates", () => {
  it("403s when the trainee isn't enrolled in the course", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    db.quizAttempt.findMany.mockResolvedValue([]);
    const res = await POST(req({ qq1: "a1" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(403);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("403s when the lesson is still locked (previous lessons incomplete)", async () => {
    unlocked.mockResolvedValue(false);
    db.quizAttempt.findMany.mockResolvedValue([]);
    const res = await POST(req({ qq1: "a1" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(403);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("lets a super admin preview (attempt without enrollment)", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    db.enrollment.findUnique.mockResolvedValue(null); // not enrolled
    db.quizAttempt.findMany.mockResolvedValue([]);
    const res = await POST(req({ qq1: "a1" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(200);
    expect(db.enrollment.findUnique).not.toHaveBeenCalled();
    expect(db.quizAttempt.create).toHaveBeenCalled();
  });
});

describe("POST quiz attempt — gating runs inside the transaction", () => {
  it("enforces retryLimit (out of attempts -> 423)", async () => {
    db.quizAttempt.findMany.mockResolvedValue([
      { needsReview: false, locked: false, passed: false, reviewedAt: null },
      { needsReview: false, locked: false, passed: false, reviewedAt: null },
      { needsReview: false, locked: false, passed: false, reviewedAt: null },
    ]);
    const res = await POST(req({ qq1: "a1" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(423);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("blocks a locked quiz (423)", async () => {
    db.quizAttempt.findMany.mockResolvedValue([{ needsReview: false, locked: true, passed: false, reviewedAt: null }]);
    const res = await POST(req(), { params: { quizId: "q1" } });
    expect(res.status).toBe(423);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("blocks while an earlier attempt awaits review (409)", async () => {
    db.quizAttempt.findMany.mockResolvedValue([{ needsReview: true, locked: false, passed: false, reviewedAt: null }]);
    const res = await POST(req(), { params: { quizId: "q1" } });
    expect(res.status).toBe(409);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects after already passing (400)", async () => {
    db.quizAttempt.findMany.mockResolvedValue([{ needsReview: false, locked: false, passed: true, reviewedAt: new Date() }]);
    const res = await POST(req(), { params: { quizId: "q1" } });
    expect(res.status).toBe(400);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("creates the attempt and awards on a fresh passing submission", async () => {
    db.quizAttempt.findMany.mockResolvedValue([]);
    const res = await POST(req({ qq1: "a1" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(db.quizAttempt.create).toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalled();
    expect(award).toHaveBeenCalledWith("u1", "c1");
  });

  it("rejects a quiz with no questions (400) instead of auto-passing", async () => {
    db.quiz.findUnique.mockResolvedValue({ ...quiz, questions: [] });
    db.quizAttempt.findMany.mockResolvedValue([]);
    const res = await POST(req(), { params: { quizId: "q1" } });
    expect(res.status).toBe(400);
    expect(db.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("sends open-ended answers to review instead of auto-passing on an exact match", async () => {
    db.quiz.findUnique.mockResolvedValue({
      ...quiz,
      questions: [{ id: "qq2", type: "OPEN_ENDED", points: 1, answers: [{ id: "a", text: "ready", isCorrect: true }] }],
    });
    db.quizAttempt.findMany.mockResolvedValue([]);
    // Even submitting the exact expected word must not auto-pass now.
    const res = await POST(req({ qq2: "ready" }), { params: { quizId: "q1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needsReview).toBe(true);
    expect(body.passed).toBe(false);
    expect(db.quizAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ needsReview: true, passed: false }) })
    );
  });
});
