import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const LessonCreateSchema = z.object({ title: z.string().trim().min(1).max(300) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, LessonCreateSchema);
  if (!parsed.ok) return parsed.response;

  const count = await prisma.lesson.count({ where: { moduleId: params.id } });
  const lesson = await prisma.lesson.create({
    data: { title: parsed.data.title, moduleId: params.id, order: count },
  });
  return NextResponse.json(lesson);
}
