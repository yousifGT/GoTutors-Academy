import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  lesson: { findUnique: vi.fn() },
  enrollment: { findUnique: vi.fn() },
  progress: { upsert: vi.fn(), update: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/course-progress", () => ({ isLessonUnlocked: vi.fn() }));
vi.mock("@/lib/certificate", () => ({ maybeAwardCertificate: vi.fn() }));

import { getServerSession } from "next-auth";
import { isLessonUnlocked } from "@/lib/course-progress";
import { maybeAwardCertificate } from "@/lib/certificate";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const unlocked = isLessonUnlocked as unknown as ReturnType<typeof vi.fn>;
const award = maybeAwardCertificate as unknown as ReturnType<typeof vi.fn>;

function req(body: Record<string, unknown>) {
  return new Request("https://app.test/api/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "u1", roleType: "TRAINEE" } });
  db.lesson.findUnique.mockResolvedValue({
    module: { courseId: "c1" },
    video: { provider: "YOUTUBE" },
    quiz: { _count: { questions: 3 } },
  });
  db.enrollment.findUnique.mockResolvedValue({ userId: "u1" });
  unlocked.mockResolvedValue(true);
  // Echo the decided fields back so the response reflects computeWatchState.
  db.progress.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", ...data }));
});

describe("POST /api/progress — access + watch gating", () => {
  it("403s when a trainee isn't enrolled", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 90, duration: 95 }), {} as never);
    expect(res.status).toBe(403);
    expect(db.progress.update).not.toHaveBeenCalled();
  });

  it("lets a super admin record preview progress without enrollment", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    db.enrollment.findUnique.mockResolvedValue(null);
    // Opened long enough ago that a full watch is within the 2x real-time cap.
    db.progress.upsert.mockResolvedValue({ timeSpent: 0, videoWatched: false, createdAt: new Date(Date.now() - 200_000) });
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 95, duration: 95 }), {} as never);
    expect(res.status).toBe(200);
    expect(db.enrollment.findUnique).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.videoWatched).toBe(true);
  });

  it("does not complete on a forged instant claim (row just created)", async () => {
    db.progress.upsert.mockResolvedValue({ timeSpent: 0, videoWatched: false, createdAt: new Date() });
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 95, duration: 95 }), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.videoWatched).toBe(false);
  });

  it("completes a full watch once enough real time has elapsed", async () => {
    db.progress.upsert.mockResolvedValue({ timeSpent: 0, videoWatched: false, createdAt: new Date(Date.now() - 200_000) });
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 95, duration: 95 }), {} as never);
    const body = await res.json();
    expect(body.videoWatched).toBe(true);
  });

  it("re-anchors a future createdAt (clock skew) instead of locking forever", async () => {
    // A stored anchor in the future can only come from a skewed clock; it must
    // not permanently block completion.
    db.progress.upsert.mockResolvedValue({ timeSpent: 0, videoWatched: false, createdAt: new Date(Date.now() + 3_600_000) });
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 95, duration: 95 }), {} as never);
    expect(res.status).toBe(200);
    // This request restarts the count from now (not yet watched), and resets the anchor.
    const call = db.progress.update.mock.calls[0][0];
    expect(call.data.createdAt).toBeInstanceOf(Date);
    expect(call.data.videoWatched).toBe(false);
  });
});

describe("POST /api/progress completes a lesson with nothing to do", () => {
  // A lesson with no video and no questions could never satisfy
  // "videoWatched AND quizPassed", so it locked every later lesson for every
  // enrolled trainee — while the publish-review page said that was fine.
  it("marks a lesson with no video and no quiz complete on view", async () => {
    db.lesson.findUnique.mockResolvedValue({ module: { courseId: "c1" }, video: null, quiz: null });
    const res = await POST(req({ lessonId: "l1" }), {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.videoWatched).toBe(true);
    expect(data.quizPassed).toBe(true);
    // The award normally rides on a passing attempt; there is no attempt here.
    expect(award).toHaveBeenCalledWith("u1", "c1");
  });

  it("passes a quiz that exists but asks nothing", async () => {
    db.lesson.findUnique.mockResolvedValue({ module: { courseId: "c1" }, video: null, quiz: { _count: { questions: 0 } } });
    const res = await POST(req({ lessonId: "l1" }), {} as never);
    expect((await res.json()).quizPassed).toBe(true);
  });

  it("leaves a real quiz to be passed properly", async () => {
    db.lesson.findUnique.mockResolvedValue({ module: { courseId: "c1" }, video: null, quiz: { _count: { questions: 2 } } });
    const res = await POST(req({ lessonId: "l1" }), {} as never);
    const data = await res.json();
    expect(data.videoWatched).toBe(true);
    expect(data.quizPassed).toBeUndefined();
    expect(award).not.toHaveBeenCalled();
  });

  it("does not fake a watch for a lesson that has a video", async () => {
    const res = await POST(req({ lessonId: "l1", watchedSeconds: 1, duration: 600 }), {} as never);
    expect((await res.json()).videoWatched).toBe(false);
  });
});
