import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn() },
  progress: { count: vi.fn() },
  certificate: { findUnique: vi.fn(), create: vi.fn() },
  enrollment: { updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/notify", () => ({ notifyCentreAndInstructor: vi.fn() }));
vi.mock("@/lib/training", () => ({ recomputeIsTrained: vi.fn() }));
vi.mock("@/lib/promotion", () => ({ autoPromoteTrainedFields: vi.fn().mockResolvedValue([]) }));

import { Prisma } from "@prisma/client";
import { maybeAwardCertificate } from "./certificate";
import { recomputeIsTrained } from "@/lib/training";

const recompute = recomputeIsTrained as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  // Two-lesson course by default.
  db.course.findUnique.mockResolvedValue({ title: "Course", modules: [{ lessons: [{ id: "l1" }, { id: "l2" }] }] });
  db.user.findUnique.mockResolvedValue({ name: "Trainee", centreId: "ce1" });
  db.enrollment.updateMany.mockResolvedValue({ count: 1 });
});

describe("maybeAwardCertificate", () => {
  it("does nothing when the course isn't fully complete", async () => {
    db.progress.count.mockResolvedValue(1); // 1 of 2 lessons done
    await maybeAwardCertificate("u1", "c1");
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("awards a certificate when complete and none exists", async () => {
    db.progress.count.mockResolvedValue(2);
    db.certificate.findUnique.mockResolvedValue(null);
    db.certificate.create.mockResolvedValue({ id: "cert1" });
    await maybeAwardCertificate("u1", "c1");
    expect(db.certificate.create).toHaveBeenCalled();
    expect(db.enrollment.updateMany).toHaveBeenCalled();
    expect(recompute).toHaveBeenCalledWith("u1");
  });

  it("is idempotent when a certificate already exists", async () => {
    db.progress.count.mockResolvedValue(2);
    db.certificate.findUnique.mockResolvedValue({ id: "cert1" });
    await maybeAwardCertificate("u1", "c1");
    expect(db.certificate.create).not.toHaveBeenCalled();
    expect(recompute).not.toHaveBeenCalled();
  });

  it("treats a concurrent duplicate (P2002) as already-awarded, not a 500", async () => {
    db.progress.count.mockResolvedValue(2);
    db.certificate.findUnique.mockResolvedValue(null);
    db.certificate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" })
    );
    await expect(maybeAwardCertificate("u1", "c1")).resolves.toBeUndefined();
    expect(recompute).not.toHaveBeenCalled();
  });
});
