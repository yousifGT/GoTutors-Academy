import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { assertSameOrigin } from "@/lib/csrf";

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const courseId: string | undefined = body?.courseId;
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const userId = session.user.id;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !course.published) return NextResponse.json({ error: "course not available" }, { status: 404 });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, centreId: true } });
  if (user?.centreId) {
    await notifyCentreAndInstructor({
      type: "TRAINEE_ENROLLED",
      title: `${user.name} enrolled in ${course.title}`,
      link: `/centre/trainees/${userId}`,
      centreId: user.centreId,
      courseId: course.id,
    });
  }

  return NextResponse.json({ ok: true, courseId });
}
