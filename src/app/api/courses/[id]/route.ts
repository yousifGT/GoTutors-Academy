import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { assignmentRows } from "@/lib/course-assignments";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  for (const k of ["title", "description", "passThreshold", "published"] as const) {
    if (k in body) data[k] = body[k];
  }
  if (Array.isArray(body.roleIds)) {
    await prisma.courseRoleAssignment.deleteMany({ where: { courseId: params.id } });
    const subPositions: string[] = Array.isArray(body.subPositions) ? body.subPositions : [];
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
