import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { ListSearch } from "@/components/list-search";
import { formatDate } from "@/lib/utils";

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">All users</h2>
        <div className="flex items-center gap-3">
          <ListSearch placeholder="Search name, email, role, centre…" />
          <Link href="/admin/users/new" className="gt-btn-primary">Add user</Link>
        </div>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Name</th><th>Role</th><th>Sub-position</th><th>Trained</th><th>Centre</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><div className="font-medium">{u.name}</div><div className="text-xs text-[var(--muted)]">{u.email}</div></td>
                <td>{u.role.name}</td>
                <td>{u.role.type === "TRAINEE" ? (u.subPosition ?? "—") : (u.position ?? "—")}</td>
                <td>{u.role.type === "TRAINEE" ? (u.isTrained ? <span className="gt-badge bg-mint/20 text-mint">Trained</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">In training</span>) : "—"}</td>
                <td>{u.centre?.name ?? "—"}</td>
                <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                <td><TraineeRowActions userId={u.id} active={u.active} editHref={`/admin/users/${u.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
