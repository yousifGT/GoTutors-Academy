import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv } from "@/lib/csv";
import { getCourseProgressForUser } from "@/lib/course-progress";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.roleType !== "CENTRE_ADMIN" && session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const centreId = session.user.centreId;
  const enrolments = await prisma.enrollment.findMany({
    where: { user: centreId ? { centreId } : undefined },
    include: { user: { include: { centre: true } }, course: true },
    orderBy: { enrolledAt: "desc" },
  });

  const rows = await Promise.all(
    enrolments.map(async (e) => {
      const p = await getCourseProgressForUser(e.userId, e.courseId);
      return {
        trainee: e.user.name,
        email: e.user.email,
        centre: e.user.centre?.name ?? "",
        position: e.user.position ?? "",
        course: e.course.title,
        percent: p?.percent ?? 0,
        completed: e.completed ? "yes" : "no",
        enrolled_at: e.enrolledAt.toISOString(),
        last_login: e.user.lastLoginAt ? e.user.lastLoginAt.toISOString() : "",
      };
    })
  );

  return csvResponse("centre-progress.csv", toCsv(rows));
}
