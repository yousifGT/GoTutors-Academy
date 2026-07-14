import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { assignmentRows } from "@/lib/course-assignments";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const CreateCourseSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).nullish(),
  passThreshold: z.number().int().min(1).max(100).optional(),
  published: z.boolean().optional(),
  roleIds: z.array(zId).optional(),
  subPositions: z.array(z.string().max(200)).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CreateCourseSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, passThreshold, published, roleIds = [], subPositions = [] } = parsed.data;

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
