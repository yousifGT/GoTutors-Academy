import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-ui";

export default async function AuditPage() {
  await requireRole("SUPER_ADMIN");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter(Boolean) as string[]));
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="The latest 200 sensitive actions, newest first." />
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => {
              const a = l.actorId ? actorMap.get(l.actorId) : undefined;
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs text-[var(--muted)]">{formatDate(l.createdAt)} {new Date(l.createdAt).toLocaleTimeString()}</td>
                  <td>{a ? <><span className="font-medium">{a.name}</span><div className="text-xs text-[var(--muted)]">{a.email}</div></> : <span className="text-[var(--muted)]">—</span>}</td>
                  <td><span className="gt-badge bg-lavender text-magenta">{l.action}</span></td>
                  <td>{l.target ?? "—"}</td>
                  <td className="text-xs text-[var(--muted)]">{l.metadata ? JSON.stringify(l.metadata) : ""}</td>
                </tr>
              );
            })}
            {logs.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[var(--muted)]">No audit entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
