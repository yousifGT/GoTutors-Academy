import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn() },
  module: { findUnique: vi.fn() },
  lesson: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  ownsCourse,
  requireCourseAccess,
  requireModuleAccess,
  requireLessonAccess,
  type CourseActor,
} from "./course-access";

const author: CourseActor = { id: "author1", roleType: "INSTRUCTOR" };
const other: CourseActor = { id: "other1", roleType: "INSTRUCTOR" };
const superAdmin: CourseActor = { id: "sa", roleType: "SUPER_ADMIN" };

beforeEach(() => vi.clearAllMocks());

describe("ownsCourse", () => {
  it("the author owns the course", () => expect(ownsCourse(author, "author1")).toBe(true));
  it("a different instructor does not", () => expect(ownsCourse(other, "author1")).toBe(false));
  it("a super admin always does", () => expect(ownsCourse(superAdmin, "author1")).toBe(true));
});

describe("requireCourseAccess", () => {
  it("404s when the course is missing", async () => {
    db.course.findUnique.mockResolvedValue(null);
    expect((await requireCourseAccess(author, "c1"))?.status).toBe(404);
  });
  it("403s a non-author", async () => {
    db.course.findUnique.mockResolvedValue({ authorId: "author1" });
    expect((await requireCourseAccess(other, "c1"))?.status).toBe(403);
  });
  it("allows the author", async () => {
    db.course.findUnique.mockResolvedValue({ authorId: "author1" });
    expect(await requireCourseAccess(author, "c1")).toBeNull();
  });
  it("allows a super admin", async () => {
    db.course.findUnique.mockResolvedValue({ authorId: "author1" });
    expect(await requireCourseAccess(superAdmin, "c1")).toBeNull();
  });
});

describe("requireModuleAccess", () => {
  it("403s a non-author via the parent course", async () => {
    db.module.findUnique.mockResolvedValue({ course: { authorId: "author1" } });
    expect((await requireModuleAccess(other, "m1"))?.status).toBe(403);
  });
  it("allows the author via the parent course", async () => {
    db.module.findUnique.mockResolvedValue({ course: { authorId: "author1" } });
    expect(await requireModuleAccess(author, "m1")).toBeNull();
  });
  it("404s when the module is missing", async () => {
    db.module.findUnique.mockResolvedValue(null);
    expect((await requireModuleAccess(author, "m1"))?.status).toBe(404);
  });
});

describe("requireLessonAccess", () => {
  it("403s a non-author via the grandparent course", async () => {
    db.lesson.findUnique.mockResolvedValue({ module: { course: { authorId: "author1" } } });
    expect((await requireLessonAccess(other, "l1"))?.status).toBe(403);
  });
  it("allows the author via the grandparent course", async () => {
    db.lesson.findUnique.mockResolvedValue({ module: { course: { authorId: "author1" } } });
    expect(await requireLessonAccess(author, "l1")).toBeNull();
  });
  it("404s when the lesson is missing", async () => {
    db.lesson.findUnique.mockResolvedValue(null);
    expect((await requireLessonAccess(author, "l1"))?.status).toBe(404);
  });
});
