import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const ReorderSchema = z.object({
  moduleIds: z.array(zId),
  lessonsByModule: z.record(z.string(), z.array(zId)),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, ReorderSchema);
  if (!parsed.ok) return parsed.response;
  const { moduleIds, lessonsByModule } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const courseModules = await tx.module.findMany({ where: { courseId: params.id }, select: { id: true } });
    const allowed = new Set(courseModules.map((m) => m.id));
    for (let i = 0; i < moduleIds.length; i++) {
      const id = moduleIds[i];
      if (!allowed.has(id)) continue;
      await tx.module.update({ where: { id }, data: { order: i } });
    }
    for (const [moduleId, lessonIds] of Object.entries(lessonsByModule)) {
      if (!allowed.has(moduleId)) continue;
      // Only reorder lessons that actually belong to this (course-owned) module.
      const owned = new Set(
        (await tx.lesson.findMany({ where: { moduleId }, select: { id: true } })).map((l) => l.id)
      );
      for (let i = 0; i < lessonIds.length; i++) {
        if (!owned.has(lessonIds[i])) continue;
        await tx.lesson.update({ where: { id: lessonIds[i] }, data: { order: i } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
