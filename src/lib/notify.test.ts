import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  course: { findUnique: vi.fn() },
  notification: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { notifyCentreAndInstructor } from "./notify";

const recipients = () => db.notification.createMany.mock.calls[0][0].data.map((n: { userId: string }) => n.userId).sort();

beforeEach(() => {
  vi.clearAllMocks();
  db.course.findUnique.mockResolvedValue({ authorId: "author" });
  // findMany is asked for centre admins or super admins depending on the learner.
  db.user.findMany.mockImplementation(async ({ where }: any) =>
    where.role.type === "CENTRE_ADMIN" ? [{ id: "centre-admin" }, { id: "head" }] : [{ id: "super" }]
  );
});

const event = { type: "RETRY_UNLOCK_NEEDED" as const, title: "t", centreId: "london", courseId: "c1" };

describe("notifyCentreAndInstructor", () => {
  it("tells a trainee's centre admins and the course author", async () => {
    db.user.findUnique.mockResolvedValue({ role: { type: "TRAINEE" } });
    await notifyCentreAndInstructor({ ...event, learnerId: "trainee" });
    expect(recipients()).toEqual(["author", "centre-admin", "head"]);
  });

  // A head locked out of a quiz was told they themselves needed unlocking, and so
  // were their peers — none of whom may unlock a non-trainee.
  it("sends a head's lockout to the super admins, not to the head or their peers", async () => {
    db.user.findUnique.mockResolvedValue({ role: { type: "CENTRE_ADMIN" } });
    await notifyCentreAndInstructor({ ...event, learnerId: "head" });
    expect(recipients()).toEqual(["author", "super"]);
  });

  it("never notifies the learner about their own attempt", async () => {
    db.user.findUnique.mockResolvedValue({ role: { type: "INSTRUCTOR" } });
    db.course.findUnique.mockResolvedValue({ authorId: "author" });
    await notifyCentreAndInstructor({ ...event, learnerId: "author" });
    expect(recipients()).toEqual(["super"]);
  });
});
