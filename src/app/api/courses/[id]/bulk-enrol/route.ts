import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyCentreAndInstructor } from "@/lib/notify";
import { centreUserScope } from "@/lib/scope";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const BulkEnrolSchema = z.object({ userIds: z.array(zId).min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, authorId: true, published: true },
  });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isSuper = session.user.roleType === "SUPER_ADMIN";
  const isAuthor = session.user.id === course.authorId;
  const isCentreAdmin = session.user.roleType === "CENTRE_ADMIN";
  if (!isSuper && !isAuthor && !isCentreAdmin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Only the author / super admins may enrol into an unpublished (draft) course.
  if (!course.published && !isSuper && !isAuthor)
    return NextResponse.json({ error: "Course is not published" }, { status: 400 });

  const parsed = await parseJson(req, BulkEnrolSchema);
  if (!parsed.ok) return parsed.response;
  const { userIds } = parsed.data;

  // Centre admins may only enrol users from their own centre (a null centre
  // matches nobody — never every centre). Super admins / authors are unscoped.
  const targets = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      ...(isCentreAdmin ? centreUserScope(session.user) : {}),
    },
    select: { id: true, name: true, centreId: true },
  });

  // Skip users already enrolled (for an accurate count + notifications); the DB
  // unique constraint + skipDuplicates backstops the race with a concurrent enrol.
  const already = await prisma.enrollment.findMany({
    where: { courseId: course.id, userId: { in: targets.map((t) => t.id) } },
    select: { userId: true },
  });
  const alreadySet = new Set(already.map((e) => e.userId));
  const toEnrol = targets.filter((t) => !alreadySet.has(t.id));

  const result = await prisma.enrollment.createMany({
    data: toEnrol.map((t) => ({ userId: t.id, courseId: course.id })),
    skipDuplicates: true,
  });

  // Best-effort notifications — one failure must not fail the whole enrol.
  await Promise.allSettled(
    toEnrol
      .filter((t) => t.centreId)
      .map((t) =>
        notifyCentreAndInstructor({
          type: "TRAINEE_ENROLLED",
          title: `${t.name} enrolled in ${course.title}`,
          link: `/centre/trainees/${t.id}`,
          centreId: t.centreId as string,
          courseId: course.id,
        })
      )
  );

  return NextResponse.json({ added: result.count, skipped: userIds.length - result.count });
}
