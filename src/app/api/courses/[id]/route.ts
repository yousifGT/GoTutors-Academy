import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { requireCourseAccess } from "@/lib/course-access";
import { assignmentRows } from "@/lib/course-assignments";
import { syncCourseEnrollments } from "@/lib/auto-enrol";
import { courseTraineeFields, recomputeIsTrainedForFields } from "@/lib/training";
import { snapshotCourse } from "@/lib/course-version";
import { wouldCreateCycle } from "@/lib/course-prereqs";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const UpdateCourseSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  passThreshold: z.number().int().min(1).max(100).optional(),
  published: z.boolean().optional(),
  roleIds: z.array(zId).optional(),
  subPositions: z.array(z.string().max(200)).optional(),
  prerequisiteIds: z.array(zId).max(50).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const denied = await requireCourseAccess(session.user, params.id);
  if (denied) return denied;

  const parsed = await parseJson(req, UpdateCourseSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const existing = await prisma.course.findUnique({ where: { id: params.id }, select: { published: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.prerequisiteIds !== undefined) {
    const ids = [...new Set(body.prerequisiteIds)];
    const found = await prisma.course.count({ where: { id: { in: ids } } });
    if (found !== ids.length)
      return NextResponse.json({ error: "Unknown prerequisite course" }, { status: 400 });
    if (await wouldCreateCycle(params.id, ids))
      return NextResponse.json(
        { error: "That would create a circular prerequisite (a course can't require itself, directly or indirectly)" },
        { status: 400 }
      );
    await prisma.coursePrerequisite.deleteMany({ where: { courseId: params.id } });
    if (ids.length > 0) {
      await prisma.coursePrerequisite.createMany({
        data: ids.map((prerequisiteId) => ({ courseId: params.id, prerequisiteId })),
      });
    }
  }

  // Publish flips and audience rewrites change what "fully trained" requires,
  // so capture the affected fields before AND after to refresh the flag both ways.
  const publishFlipping = body.published !== undefined && body.published !== existing.published;
  const audienceChanging = body.roleIds !== undefined;
  const fieldsBefore = publishFlipping || audienceChanging ? await courseTraineeFields(params.id) : [];

  const data: Record<string, unknown> = {};
  for (const k of ["title", "description", "passThreshold", "published"] as const) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.category !== undefined) data.category = body.category || null;
  if (body.roleIds !== undefined) {
    await prisma.courseRoleAssignment.deleteMany({ where: { courseId: params.id } });
    const subPositions = body.subPositions ?? [];
    await prisma.courseRoleAssignment.createMany({
      data: assignmentRows(body.roleIds, subPositions).map((r) => ({ ...r, courseId: params.id })),
    });
  }
  const updated = await prisma.course.update({ where: { id: params.id }, data });
  // Every draft->published transition captures an immutable version snapshot,
  // so certificates can always point at exactly what trainees saw.
  if (!existing.published && updated.published) {
    await snapshotCourse(updated.id);
  }
  // Publishing (or re-targeting a published course) enrols matching trainees.
  if (updated.published && (body.published !== undefined || body.roleIds !== undefined)) {
    await syncCourseEnrollments(updated.id);
  }
  if (publishFlipping || (audienceChanging && updated.published)) {
    const fieldsAfter = audienceChanging ? await courseTraineeFields(params.id) : fieldsBefore;
    await recomputeIsTrainedForFields([...fieldsBefore, ...fieldsAfter]);
  }
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const denied = await requireCourseAccess(session.user, params.id);
  if (denied) return denied;
  // Deleting a published course shrinks the requirement for its fields —
  // someone missing only this course becomes fully trained.
  const course = await prisma.course.findUnique({ where: { id: params.id }, select: { published: true } });
  const fields = course?.published ? await courseTraineeFields(params.id) : [];
  await prisma.course.delete({ where: { id: params.id } });
  await recomputeIsTrainedForFields(fields);
  return NextResponse.json({ ok: true });
}
