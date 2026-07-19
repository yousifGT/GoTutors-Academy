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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="gt-card flex flex-col p-5 transition hover:border-picton/50">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/15 text-xl text-gold">🏫</div>
                <div className="text-right">
                  <div className={`text-2xl font-bold tracking-tight ${r.passRate >= 70 ? "text-mint" : r.passRate >= 40 ? "text-gold" : "text-orange"}`}>{r.passRate}%</div>
                  <div className="text-xs text-[var(--muted)]">pass rate</div>
                </div>
              </div>
              <div className="mt-3 min-w-0 flex-1">
                <div className="text-lg font-bold tracking-tight">{r.name}</div>
                <div className="mt-2"><ProgressBar percent={r.passRate} /></div>
                <div className="mt-2 flex gap-2">
                  <span className="gt-badge bg-mint/15 text-mint">✓ {r.passes} passed</span>
                  <span className="gt-badge bg-orange/15 text-orange">✗ {r.fails} failed</span>
                </div>
              </div>
              <div className="mt-4 flex gap-5 border-t border-[var(--border)] pt-3">
                <div>
                  <div className="text-xl font-bold leading-tight">{r.users}</div>
                  <div className="text-xs text-[var(--muted)]">user{r.users === 1 ? "" : "s"}</div>
                </div>
                <div>
                  <div className="text-xl font-bold leading-tight">{r.enrolments}</div>
                  <div className="text-xs text-[var(--muted)]">enrolment{r.enrolments === 1 ? "" : "s"}</div>
                </div>
                <div>
                  <div className="text-xl font-bold leading-tight">{r.completed}</div>
                  <div className="text-xs text-[var(--muted)]">completed</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
