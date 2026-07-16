import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CoursePublishToggle } from "@/components/course-publish-toggle";

export default async function AdminCoursesPage() {
  await requireRole("SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    include: { author: true, _count: { select: { modules: true, enrollments: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">All courses</h2>
        <Link href="/instructor/courses/new" className="gt-btn-primary">New course</Link>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Title</th><th>Author</th><th>Modules</th><th>Enrolments</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.title}</td>
                <td>{c.author.name}</td>
                <td>{c._count.modules}</td>
                <td>{c._count.enrollments}</td>
                <td>{c.published ? <span className="gt-badge bg-mint/20 text-mint">Published</span> : <span className="gt-badge bg-gold/20 text-gold">Draft</span>}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <CoursePublishToggle courseId={c.id} published={c.published} />
                    <Link href={`/instructor/courses/${c.id}`} className="gt-btn-ghost text-sm">Open</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
