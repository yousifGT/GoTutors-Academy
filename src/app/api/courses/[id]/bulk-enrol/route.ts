import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const BulkEnrolSchema = z.object({ userIds: z.array(zId).min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const course = await prisma.course.findUnique({ where: { id: params.id } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed =
    session.user.roleType === "SUPER_ADMIN" ||
    session.user.id === course.authorId ||
    session.user.roleType === "CENTRE_ADMIN";
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, BulkEnrolSchema);
  if (!parsed.ok) return parsed.response;
  const { userIds } = parsed.data;

  // centre admins can only enrol users from their own centre
  const targets = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      ...(session.user.roleType === "CENTRE_ADMIN" ? { centreId: session.user.centreId ?? undefined } : {}),
    },
    select: { id: true, name: true, centreId: true },
  });

  let added = 0;
  for (const t of targets) {
    const existed = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: t.id, courseId: course.id } },
    });
    if (existed) continue;
    await prisma.enrollment.create({ data: { userId: t.id, courseId: course.id } });
    added += 1;
    if (t.centreId) {
      await notifyCentreAndInstructor({
        type: "TRAINEE_ENROLLED",
        title: `${t.name} enrolled in ${course.title}`,
        link: `/centre/trainees/${t.id}`,
        centreId: t.centreId,
        courseId: course.id,
      });
    }
  }

  return NextResponse.json({ added, skipped: userIds.length - added });
}
