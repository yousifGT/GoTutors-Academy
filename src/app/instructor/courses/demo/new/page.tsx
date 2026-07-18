import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { WizardSteps } from "@/components/wizard-steps";
import { CourseWizardDetails } from "@/components/course-wizard-details";

export default async function DemoNewCoursePage() {
  await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const [roles, subPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/instructor/courses/demo" className="text-sm text-picton">← Courses</Link>
        <h2 className="text-2xl font-bold mt-1">New course</h2>
      </div>
      <WizardSteps current={1} />
      <CourseWizardDetails
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        allSubPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
      />
    </div>
  );
}
