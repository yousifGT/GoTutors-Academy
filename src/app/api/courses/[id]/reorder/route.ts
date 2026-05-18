import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { moduleIds: string[]; lessonsByModule: Record<string, string[]> };

  await prisma.$transaction(async (tx) => {
    const courseModules = await tx.module.findMany({ where: { courseId: params.id }, select: { id: true } });
    const allowed = new Set(courseModules.map((m) => m.id));
    for (let i = 0; i < body.moduleIds.length; i++) {
      const id = body.moduleIds[i];
      if (!allowed.has(id)) continue;
      await tx.module.update({ where: { id }, data: { order: i } });
    }
    for (const [moduleId, lessonIds] of Object.entries(body.lessonsByModule)) {
      if (!allowed.has(moduleId)) continue;
      for (let i = 0; i < lessonIds.length; i++) {
        await tx.lesson.update({ where: { id: lessonIds[i] }, data: { order: i } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
