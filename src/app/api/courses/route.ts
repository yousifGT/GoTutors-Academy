import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { assignmentRows } from "@/lib/course-assignments";
import { syncCourseEnrollments } from "@/lib/auto-enrol";
import { courseTraineeFields, recomputeIsTrainedForFields } from "@/lib/training";
import { snapshotCourse } from "@/lib/course-version";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const CreateCourseSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).nullish(),
  category: z.string().trim().max(100).nullish(),
  passThreshold: z.number().int().min(1).max(100).optional(),
  published: z.boolean().optional(),
  roleIds: z.array(zId).optional(),
  subPositions: z.array(z.string().max(200)).optional(),
  prerequisiteIds: z.array(zId).max(50).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CreateCourseSchema);
  if (!parsed.ok) return parsed.response;
  const { title, description, passThreshold, published, roleIds = [], subPositions = [] } = parsed.data;

  const prerequisiteIds = [...new Set(parsed.data.prerequisiteIds ?? [])];
  if (prerequisiteIds.length > 0) {
    const found = await prisma.course.count({ where: { id: { in: prerequisiteIds } } });
    if (found !== prerequisiteIds.length)
      return NextResponse.json({ error: "Unknown prerequisite course" }, { status: 400 });
  }

  const course = await prisma.course.create({
    data: {
      title,
      description: description ?? null,
      category: parsed.data.category || null,
      passThreshold: passThreshold ?? 70,
      published: !!published,
      authorId: session.user.id,
      roleAssignments: { create: assignmentRows(roleIds, subPositions) },
      prerequisites: { create: prerequisiteIds.map((prerequisiteId) => ({ prerequisiteId })) },
    },
  });
  if (course.published) {
    await snapshotCourse(course.id);
    await syncCourseEnrollments(course.id);
    // A newly published course raises the bar for its fields — refresh flags.
    await recomputeIsTrainedForFields(await courseTraineeFields(course.id));
  }
  return NextResponse.json(course);
}
