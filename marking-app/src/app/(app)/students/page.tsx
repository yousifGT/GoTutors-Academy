import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";
import { PageHeader, Empty, Avatar } from "@/components/ui";
import { StudentsManager, StudentActions } from "@/components/students-manager";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const viewer = await requireViewer();

  const [students, tutors] = await Promise.all([
    prisma.student.findMany({
      where: studentScope(viewer),
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { tutor: { select: { name: true } }, _count: { select: { submissions: true } } },
    }),
    viewer.role === "ADMIN"
      ? prisma.user.findMany({
          where: { organisationId: viewer.organisationId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([{ id: viewer.id, name: viewer.name }]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="The children whose work you mark. They never sign in — this is a record, not an account."
        backHref="/"
        backLabel="Dashboard"
      />

      <StudentsManager tutors={tutors} canAssignTutor={viewer.role === "ADMIN"} currentUserId={viewer.id} />

      {students.length === 0 ? (
        <Empty title="No students yet">Add the first one above.</Empty>
      ) : (
        <div className="card p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Year</th>
                  <th>Tutor</th>
                  <th>Papers</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} size="sm" />
                        <Link href={`/students/${s.id}`} className="font-medium text-sky hover:underline">
                          {s.name}
                        </Link>
                        {!s.active && <span className="badge bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
                      </div>
                    </td>
                    <td className="text-[var(--muted)]">{s.yearGroup ?? "—"}</td>
                    <td className="text-[var(--muted)]">{s.tutor.name}</td>
                    <td>{s._count.submissions}</td>
                    <td>
                      <StudentActions studentId={s.id} active={s.active} paperCount={s._count.submissions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
