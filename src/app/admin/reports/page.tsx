import { requireRole } from "@/lib/session";
import { centreReportRows } from "@/lib/centre-report";
import { PageHeader } from "@/components/page-ui";

export default async function AdminReportsPage() {
  await requireRole("SUPER_ADMIN");
  const rows = await centreReportRows();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Per-centre training performance."
        actions={<a href="/api/reports/admin/export" className="gt-btn-ghost">Download CSV</a>}
      />
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
          {rows.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-[var(--muted)]">No centres yet.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}
