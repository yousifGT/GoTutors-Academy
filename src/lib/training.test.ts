import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  course: { findMany: vi.fn() },
  certificate: { findMany: vi.fn() },
  subPosition: { findMany: vi.fn() },
  courseRoleAssignment: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { recomputeIsTrained, recomputeIsTrainedForFields } from "./training";

/** A promoted tutor: no fields left in training, the field held as a title. */
function promotedTutor(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    isTrained: true,
    subPosition: null,
    subPositions: [],
    teacherPositions: ["Maths Tutor"],
    role: { type: "TRAINEE" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.subPosition.findMany.mockResolvedValue([{ name: "Maths Tutor" }, { name: "English Tutor" }]);
  db.user.update.mockResolvedValue({});
});

describe("recomputeIsTrained", () => {
  // The bug: a fully promoted person has an empty subPositions array, so the
  // function returned early and the stored flag could never fall back to false.
  it("re-evaluates a promoted tutor whose field gained a course", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor());
    db.course.findMany.mockResolvedValue([
      { id: "c1", minCertifiedVersion: 0 },
      { id: "c2", minCertifiedVersion: 0 }, // published after they qualified
    ]);
    db.certificate.findMany.mockResolvedValue([{ courseId: "c1", courseVersion: 1 }]);

    expect(await recomputeIsTrained("u1")).toBe(false);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isTrained: false } });
  });

  it("keeps a tutor trained while every course of their field is certified", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor({ isTrained: false }));
    db.course.findMany.mockResolvedValue([{ id: "c1", minCertifiedVersion: 0 }]);
    db.certificate.findMany.mockResolvedValue([{ courseId: "c1", courseVersion: 1 }]);

    expect(await recomputeIsTrained("u1")).toBe(true);
  });

  // Matches the rule field-training.ts applies, so the flag and the per-field
  // status can no longer disagree after a require-retraining republish.
  it("stops counting a certificate below the course's version floor", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor());
    db.course.findMany.mockResolvedValue([{ id: "c1", minCertifiedVersion: 3 }]);
    db.certificate.findMany.mockResolvedValue([{ courseId: "c1", courseVersion: 2 }]);

    expect(await recomputeIsTrained("u1")).toBe(false);
  });

  it("treats a pre-versioning certificate as version 0", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor());
    db.course.findMany.mockResolvedValue([{ id: "c1", minCertifiedVersion: 0 }]);
    db.certificate.findMany.mockResolvedValue([{ courseId: "c1", courseVersion: null }]);

    expect(await recomputeIsTrained("u1")).toBe(true);
  });

  it("leaves the flag alone when the person holds no fields at all", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor({ teacherPositions: [], isTrained: true }));
    expect(await recomputeIsTrained("u1")).toBe(true);
    expect(db.course.findMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("leaves the flag alone when the field has no published courses yet", async () => {
    db.user.findUnique.mockResolvedValue(promotedTutor());
    db.course.findMany.mockResolvedValue([]);
    expect(await recomputeIsTrained("u1")).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("ignores a title whose field no longer exists", async () => {
    db.subPosition.findMany.mockResolvedValue([{ name: "English Tutor" }]); // Maths deleted
    db.user.findUnique.mockResolvedValue(promotedTutor());
    expect(await recomputeIsTrained("u1")).toBe(true);
    expect(db.course.findMany).not.toHaveBeenCalled();
  });
});

describe("recomputeIsTrainedForFields", () => {
  // Publishing a course in a field changes the requirement for its tutors too —
  // that is what makes a lapse detectable at all.
  it("includes tutors of the field, not just trainees", async () => {
    db.user.findMany.mockResolvedValue([]);
    await recomputeIsTrainedForFields(["Maths Trainee"]);

    const or = db.user.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual(
      expect.arrayContaining([{ teacherPositions: { hasSome: ["Maths Tutor"] } }])
    );
  });

  it("does nothing for an empty field list", async () => {
    expect(await recomputeIsTrainedForFields([])).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
