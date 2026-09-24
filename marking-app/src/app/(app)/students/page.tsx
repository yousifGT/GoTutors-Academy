import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";
import { rankStudents, studentSearchFilter } from "@/lib/marking/student-search";
import { PageHeader, Empty, Avatar } from "@/components/ui";
import { StudentsManager, StudentActions } from "@/components/students-manager";
import { StudentSearch } from "@/components/student-search-box";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: { searchParams: { q?: string } }) {
  const viewer = await requireViewer();
  const query = searchParams.q ?? "";

  const [students, tutors, total] = await Promise.all([
    prisma.student.findMany({
      where: { ...studentScope(viewer), ...studentSearchFilter(query) },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 200,
      include: { tutor: { select: { name: true } }, _count: { select: { submissions: true } } },
    }),
    viewer.role === "ADMIN"
      ? prisma.user.findMany({
          where: { organisationId: viewer.organisationId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([{ id: viewer.id, name: viewer.name }]),
    prisma.student.count({ where: studentScope(viewer) }),
  ]);

  // An exact admission-number match goes to the top: `contains` alone puts
  // "GT-100" above the child actually numbered "GT-1".
  const ordered = rankStudents(students, query);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="Look a child up by admission number or name to see everything they have been marked on."
        backHref="/"
        backLabel="Dashboard"
      />

      {total > 0 && <StudentSearch initial={query} />}

      <StudentsManager tutors={tutors} canAssignTutor={viewer.role === "ADMIN"} currentUserId={viewer.id} />

      {ordered.length === 0 ? (
        <Empty title={query ? `Nobody matches “${query}”` : "No students yet"}>
          {query ? "Try the admission number instead." : "Add the first one above."}
        </Empty>
      ) : (
        <div className="card p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Admission no.</th>
                  <th>Student</th>
                  <th>Year</th>
                  <th>Tutor</th>
                  <th>Papers</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                    <td className="whitespace-nowrap font-mono text-xs">{s.admissionNumber}</td>
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
          {students.length === 200 && (
            <div className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
              Showing the first 200. Search to narrow it down.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
