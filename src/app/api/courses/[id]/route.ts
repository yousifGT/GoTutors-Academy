import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { assignmentRows } from "@/lib/course-assignments";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const UpdateCourseSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  passThreshold: z.number().int().min(0).max(100).optional(),
  published: z.boolean().optional(),
  roleIds: z.array(zId).optional(),
  subPositions: z.array(z.string().max(200)).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, UpdateCourseSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const data: Record<string, unknown> = {};
  for (const k of ["title", "description", "passThreshold", "published"] as const) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.roleIds !== undefined) {
    await prisma.courseRoleAssignment.deleteMany({ where: { courseId: params.id } });
    const subPositions = body.subPositions ?? [];
    await prisma.courseRoleAssignment.createMany({
      data: assignmentRows(body.roleIds, subPositions).map((r) => ({ ...r, courseId: params.id })),
    });
  }
  const updated = await prisma.course.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.course.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
