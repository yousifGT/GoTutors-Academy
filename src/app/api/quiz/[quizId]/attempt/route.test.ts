import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  quiz: { findUnique: vi.fn() },
  progress: { findUnique: vi.fn(), upsert: vi.fn() },
  quizAttempt: { findMany: vi.fn(), create: vi.fn() },
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

import { getServerSession } from "next-auth";
import { maybeAwardCertificate } from "@/lib/certificate";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const award = maybeAwardCertificate as unknown as ReturnType<typeof vi.fn>;

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
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
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
});
