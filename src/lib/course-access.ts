import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RoleType } from "@prisma/client";

/**
 * Course ownership / access control.
 *
 * Holding the COURSE_EDIT / COURSE_DELETE permission means "may author courses" —
 * it does NOT mean "may touch every course". A non-super-admin may only mutate a
 * course they authored (and, by extension, that course's modules / lessons /
 * quizzes / questions). Super admins retain full access.
 *
 * This is the single choke point for course-level authorization, so when courses
 * later become centre-owned the rule changes in exactly one place.
 */
export type CourseActor = { id: string; roleType: RoleType };

/** Pure ownership predicate for when the course's authorId is already loaded. */
export function ownsCourse(actor: CourseActor, authorId: string): boolean {
  return actor.roleType === "SUPER_ADMIN" || authorId === actor.id;
}

/**
 * Authorize a mutation of a course by id. Returns `null` when allowed, or a
 * NextResponse to return: 404 if the course doesn't exist, 403 if the actor
 * isn't its author (and isn't a super admin).
 */
export async function requireCourseAccess(actor: CourseActor, courseId: string): Promise<NextResponse | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { authorId: true } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsCourse(actor, course.authorId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/** Authorize a mutation of a module via its parent course. */
export async function requireModuleAccess(actor: CourseActor, moduleId: string): Promise<NextResponse | null> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { course: { select: { authorId: true } } },
  });
  if (!mod) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsCourse(actor, mod.course.authorId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}

/** Authorize a mutation of a lesson (and its quiz) via its parent course. */
export async function requireLessonAccess(actor: CourseActor, lessonId: string): Promise<NextResponse | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { course: { select: { authorId: true } } } } },
  });
  if (!lesson) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!ownsCourse(actor, lesson.module.course.authorId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return null;
}
