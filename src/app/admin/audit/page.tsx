import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate, timeAgo } from "@/lib/utils";
import { PageHeader, EmptyState, Avatar } from "@/components/page-ui";

export default async function AuditPage() {
  await requireRole("SUPER_ADMIN");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter(Boolean) as string[]));
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="The latest 200 sensitive actions, newest first." />
      {logs.length === 0 ? (
        <EmptyState icon="🧾" title="No audit entries yet" hint="Sensitive actions — role changes, deletions, unlocks — are recorded here." />
      ) : (
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => {
              const a = l.actorId ? actorMap.get(l.actorId) : undefined;
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs text-[var(--muted)]" title={formatDate(l.createdAt)}>{timeAgo(l.createdAt)}</td>
                  <td>{a ? (
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-[var(--muted)]">{a.email}</div>
                      </div>
                    </div>
                  ) : <span className="text-[var(--muted)]">—</span>}</td>
                  <td><span className="gt-badge bg-magenta/15 text-magenta">{l.action}</span></td>
                  <td>{l.target ?? "—"}</td>
                  <td className="max-w-[18rem] truncate font-mono text-xs text-[var(--muted)]" title={l.metadata ? JSON.stringify(l.metadata) : undefined}>{l.metadata ? JSON.stringify(l.metadata) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
