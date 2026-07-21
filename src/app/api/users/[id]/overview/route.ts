import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCourseProgressForUsers } from "@/lib/course-progress";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { getFieldStatus } from "@/lib/field-training";

/**
 * Read-only profile snapshot for the user-overview popup. Who may view whom:
 *  - anyone       → themselves
 *  - SUPER_ADMIN  → anyone
 *  - CENTRE_ADMIN → users of their own (non-null) centre
 *  - INSTRUCTOR   → only trainees enrolled in one of their courses
 *  - anyone set as a user's supervisor → that supervisee
 *    (supervisor is a field on the user, not a role)
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      role: { select: { name: true, type: true } },
      centre: { select: { name: true } },
      supervisor: { select: { name: true } },
    },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const viewer = session.user;
  let allowed =
    viewer.roleType === "SUPER_ADMIN" ||
    viewer.id === target.id ||
    target.supervisorId === viewer.id;
  if (!allowed && viewer.roleType === "CENTRE_ADMIN") {
    allowed = viewer.centreId != null && target.centreId === viewer.centreId;
  }
  if (!allowed && viewer.roleType === "INSTRUCTOR") {
    const shared = await prisma.enrollment.count({
      where: { userId: target.id, course: { authorId: viewer.id } },
    });
    allowed = shared > 0;
  }
  if (!allowed) return NextResponse.json({ error: "You don't have access to this profile" }, { status: 403 });

  const canPromote =
    (viewer.roleType === "SUPER_ADMIN" ||
      (viewer.roleType === "CENTRE_ADMIN" && viewer.centreId != null && target.centreId === viewer.centreId)) &&
    (target.role.type === "TRAINEE" || target.role.type === "INSTRUCTOR");

  const [enrollments, certificates, authoredCourses, fieldStatus] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: target.id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            roleAssignments: { select: { subPosition: true, role: { select: { name: true } } } },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    }),
    prisma.certificate.findMany({
      where: { userId: target.id },
      include: { course: { select: { title: true } } },
      orderBy: { issuedAt: "desc" },
    }),
    target.role.type === "INSTRUCTOR" || target.role.type === "SUPER_ADMIN"
      ? prisma.course.findMany({
          where: { authorId: target.id },
          select: { id: true, title: true, published: true, _count: { select: { enrollments: true } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    target.role.type === "TRAINEE" || target.role.type === "INSTRUCTOR"
      ? getFieldStatus(target)
      : Promise.resolve([]),
  ]);

  const progressByKey = await getCourseProgressForUsers(
    enrollments.map((e) => ({ userId: e.userId, courseId: e.courseId }))
  );

  return NextResponse.json({
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      phone: target.phone,
      roleName: target.role.name,
      roleType: target.role.type,
      position: target.position,
      subPositions: effectiveSubPositions(target),
      teacherPositions: target.teacherPositions,
      isTrained: target.isTrained,
      active: target.active,
      centreName: target.centre?.name ?? null,
      supervisorName: target.supervisor?.name ?? null,
      lastLoginAt: target.lastLoginAt?.toISOString() ?? null,
      createdAt: target.createdAt.toISOString(),
    },
    fieldStatus,
    canPromote,
    enrollments: enrollments.map((e) => {
      const p = progressByKey.get(`${e.userId}:${e.courseId}`);
      return {
        courseId: e.course.id,
        title: e.course.title,
        // Who the course is for: its sub-position fields plus any whole-role audiences.
        fields: [...new Set(e.course.roleAssignments.filter((ra) => ra.subPosition).map((ra) => ra.subPosition as string))],
        roleWide: [...new Set(e.course.roleAssignments.filter((ra) => ra.subPosition === null).map((ra) => ra.role.name))],
        percent: p?.percent ?? 0,
        done: p?.completed ?? 0,
        total: p?.total ?? 0,
        completed: e.completed,
        enrolledAt: e.enrolledAt.toISOString(),
      };
    }),
    certificates: certificates.map((c) => ({
      id: c.id,
      courseTitle: c.course.title,
      courseVersion: c.courseVersion,
      serial: c.serial,
      issuedAt: c.issuedAt.toISOString(),
    })),
    authoredCourses: authoredCourses.map((c) => ({
      id: c.id,
      title: c.title,
      published: c.published,
      enrolments: c._count.enrollments,
    })),
  });
}
