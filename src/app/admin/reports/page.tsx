import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export default async function AdminReportsPage() {
  await requireRole("SUPER_ADMIN");
  const centres = await prisma.centre.findMany({
    include: {
      users: {
        select: {
          id: true,
          enrollments: { select: { id: true, completed: true } },
          quizAttempts: { select: { passed: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = centres.map((c) => {
    const enrolments = c.users.flatMap((u) => u.enrollments);
    const attempts = c.users.flatMap((u) => u.quizAttempts);
    const completed = enrolments.filter((e) => e.completed).length;
    const passes = attempts.filter((a) => a.passed).length;
    const fails = attempts.length - passes;
    return {
      id: c.id,
      name: c.name,
      users: c.users.length,
      enrolments: enrolments.length,
      completed,
      passes,
      fails,
      passRate: attempts.length ? Math.round((passes / attempts.length) * 100) : 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a href="/api/reports/admin/export" className="gt-btn-ghost">Download CSV</a>
      </div>
      <div className="gt-card overflow-hidden">
      <table className="gt-table">
        <thead><tr><th>Centre</th><th>Users</th><th>Enrolments</th><th>Completed</th><th>Pass rate</th><th>Passes</th><th>Fails</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.name}</td>
              <td>{r.users}</td>
              <td>{r.enrolments}</td>
              <td>{r.completed}</td>
              <td>{r.passRate}%</td>
              <td className="text-mint">{r.passes}</td>
              <td className="text-orange">{r.fails}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
