import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireRole } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { WizardSteps } from "@/components/wizard-steps";
import { PageHeader } from "@/components/page-ui";
import { CourseWizardDetails } from "@/components/course-wizard-details";
import { ADMIN_ROLE_TYPES } from "@/lib/course-assignments";

export default async function NewCoursePage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  await requirePermission(PERMISSIONS.COURSE_CREATE); // same check as this page's API
  const [roles, subPositions, categoryRows] = await Promise.all([
    // Only a super admin may aim a course at an admin role (audienceEditRefusal).
    prisma.role.findMany({
      where: session.user.roleType === "SUPER_ADMIN" ? {} : { type: { notIn: [...ADMIN_ROLE_TYPES] } },
      orderBy: { name: "asc" },
    }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
    prisma.course.findMany({
      where: {
        category: { not: null },
        ...(session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id }),
      },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);
  const availableCourses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader backHref="/instructor/courses" backLabel="Courses" title="New course" subtitle="Three steps: details, curriculum, review & publish." />
      <WizardSteps current={1} />
      <CourseWizardDetails
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        allSubPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
        categories={categoryRows.map((c) => c.category as string)}
        availableCourses={availableCourses}
      />
    </div>
  );
}
