import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { ListSearch } from "@/components/list-search";
import { formatDate } from "@/lib/utils";
import { centreUserScope } from "@/lib/scope";

export default async function CentreTraineesPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const q = (searchParams.q ?? "").trim();

  const trainees = await prisma.user.findMany({
    where: {
      ...centreUserScope(session.user),
      role: { type: "TRAINEE" },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { position: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      enrollments: { include: { course: true } },
      quizAttempts: { where: { locked: true }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Trainees</h2>
        <div className="flex items-center gap-3">
          <ListSearch placeholder="Search name, email, position…" />
          <Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link>
        </div>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Name</th><th>Sub-position</th><th>Trained</th><th>Enrolments</th><th>Last login</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {trainees.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/centre/trainees/${u.id}`} className="font-medium text-picton">{u.name}</Link><div className="text-xs text-[var(--muted)]">{u.email}</div></td>
                <td>{u.subPosition ?? u.position ?? "—"}</td>
                <td>{u.isTrained ? <span className="gt-badge bg-mint/20 text-mint">Trained</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">In training</span>}</td>
                <td>{u.enrollments.length}</td>
                <td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                <td>{u.quizAttempts.length > 0 ? <span className="gt-badge bg-orange/20 text-orange">Locked quiz</span> : u.active ? <span className="gt-badge bg-mint/20 text-mint">Active</span> : <span className="gt-badge bg-charcoal/20 text-charcoal dark:text-ice">Inactive</span>}</td>
                <td><TraineeRowActions userId={u.id} active={u.active} editHref={`/centre/trainees/${u.id}/edit`} /></td>
              </tr>
            ))}
            {trainees.length === 0 && <tr><td colSpan={7} className="text-center text-[var(--muted)] py-8">No trainees yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
