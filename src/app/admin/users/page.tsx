import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { ListSearch } from "@/components/list-search";
import { timeAgo } from "@/lib/utils";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { PageHeader, EmptyState, Avatar, RoleChip } from "@/components/page-ui";

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireRole("SUPER_ADMIN");
  const q = (searchParams.q ?? "").trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { position: { contains: q, mode: "insensitive" as const } },
          { subPosition: { contains: q, mode: "insensitive" as const } },
          { centre: { name: { contains: q, mode: "insensitive" as const } } },
          { role: { name: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    include: { role: true, centre: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Every account across all centres."
        actions={<><ListSearch placeholder="Search name, email, role, centre…" /><Link href="/admin/users/new" className="gt-btn-primary">Add user</Link></>}
      />
      {users.length === 0 ? (
        <EmptyState
          icon="👥"
          title={q ? `No users match “${q}”` : "No users yet"}
          hint={q ? "Try a different name, email, role or centre." : "Add your first user to get started."}
        />
      ) : (
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Name</th><th>Role</th><th>Sub-positions</th><th>Trained</th><th>Centre</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium">{u.name}{!u.active && <span className="gt-badge ml-2 bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}</div>
                      <div className="text-xs text-[var(--muted)]">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td><RoleChip type={u.role.type} label={u.role.name} /></td>
                <td>
                  {u.role.type === "TRAINEE" ? (
                    effectiveSubPositions(u).length > 0 ? (
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {effectiveSubPositions(u).slice(0, 2).map((sp) => (
                          <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>
                        ))}
                        {effectiveSubPositions(u).length > 2 && (
                          <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{effectiveSubPositions(u).length - 2}</span>
                        )}
                      </div>
                    ) : "—"
                  ) : (u.position ?? "—")}
                </td>
                <td>{u.role.type === "TRAINEE" ? (u.isTrained ? <span className="gt-badge bg-mint/15 text-mint">Trained</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">In training</span>) : "—"}</td>
                <td>{u.centre?.name ?? "—"}</td>
                <td className="whitespace-nowrap text-[var(--muted)]">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span className="gt-badge bg-gold/15 text-gold">Never</span>}</td>
                <td><TraineeRowActions userId={u.id} active={u.active} editHref={`/admin/users/${u.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
