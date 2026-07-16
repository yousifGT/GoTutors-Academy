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

import { getServerSession } from "next-auth";
import { isLessonUnlocked } from "@/lib/course-progress";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const unlocked = isLessonUnlocked as unknown as ReturnType<typeof vi.fn>;

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
  db.lesson.findUnique.mockResolvedValue({ module: { courseId: "c1" }, video: { provider: "YOUTUBE" } });
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
});
