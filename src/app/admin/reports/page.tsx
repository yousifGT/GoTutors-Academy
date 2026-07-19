import { requireRole } from "@/lib/session";
import { centreReportRows } from "@/lib/centre-report";
import { PageHeader, StatStrip, EmptyState } from "@/components/page-ui";
import { ProgressBar } from "@/components/progress-bar";

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
      <StatStrip
        items={[
          { label: "Centres", value: rows.length },
          { label: "Users", value: rows.reduce((n, r) => n + r.users, 0) },
          { label: "Enrolments", value: rows.reduce((n, r) => n + r.enrolments, 0) },
          { label: "Completed", value: rows.reduce((n, r) => n + r.completed, 0) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon="🏫" title="No centres yet" hint="Add a centre to see per-centre performance." />
      ) : (
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
              <td className="w-48">
                <div className="flex items-center gap-2">
                  <ProgressBar percent={r.passRate} />
                  <span className="w-10 text-right text-xs">{r.passRate}%</span>
                </div>
              </td>
              <td><span className="gt-badge bg-mint/15 text-mint">{r.passes}</span></td>
              <td><span className="gt-badge bg-orange/15 text-orange">{r.fails}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}
