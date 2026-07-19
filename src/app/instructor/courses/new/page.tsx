import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { CourseWizardDetails } from "@/components/course-wizard-details";

export default async function NewCoursePage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const [roles, subPositions, categoryRows] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
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
      <div>
        <Link href="/instructor/courses" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">New course</h2>
      </div>
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
