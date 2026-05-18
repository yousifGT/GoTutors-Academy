import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { assignmentRows } from "@/lib/course-assignments";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, description, passThreshold, published, roleIds = [], subPositions = [] } = body;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const course = await prisma.course.create({
    data: {
      title,
      description: description ?? null,
      passThreshold: passThreshold ?? 70,
      published: !!published,
      authorId: session.user.id,
      roleAssignments: { create: assignmentRows(roleIds, subPositions) },
    },
  });
  return NextResponse.json(course);
}
