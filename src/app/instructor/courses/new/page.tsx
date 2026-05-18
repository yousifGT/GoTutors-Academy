import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CourseForm } from "@/components/course-form";

export default async function NewCoursePage() {
  await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const [roles, subPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-6">New course</h2>
      <CourseForm
        roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
        allSubPositions={subPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
      />
    </div>
  );
}
