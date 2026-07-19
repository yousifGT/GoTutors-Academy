import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { TraineeRowActions } from "@/components/trainee-row-actions";
import { ListSearch } from "@/components/list-search";
import { timeAgo } from "@/lib/utils";
import { centreUserScope } from "@/lib/scope";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { PageHeader, EmptyState, Avatar } from "@/components/page-ui";

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
      <PageHeader
        title="Trainees"
        subtitle="Everyone training at your centre."
        actions={<><ListSearch placeholder="Search name, email, position…" /><Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link></>}
      />
      {trainees.length === 0 ? (
        <EmptyState
          icon="🧑‍🎓"
          title={q ? `No trainees match “${q}”` : "No trainees yet"}
          hint={q ? "Try a different name, email or position." : "Add your first trainee — they'll be auto-enrolled in matching courses."}
          action={q ? undefined : <Link href="/centre/trainees/new" className="gt-btn-primary">Add trainee</Link>}
        />
      ) : (
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Name</th><th>Sub-positions</th><th>Trained</th><th>Enrolments</th><th>Last login</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {trainees.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <div className="min-w-0">
                      <Link href={`/centre/trainees/${u.id}`} className="font-medium transition hover:text-picton">{u.name}</Link>
                      <div className="text-xs text-[var(--muted)]">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {effectiveSubPositions(u).length > 0 ? (
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {effectiveSubPositions(u).slice(0, 2).map((sp) => (
                        <span key={sp} className="gt-badge bg-magenta/15 text-magenta">{sp}</span>
                      ))}
                      {effectiveSubPositions(u).length > 2 && (
                        <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">+{effectiveSubPositions(u).length - 2}</span>
                      )}
                    </div>
                  ) : (u.position || "—")}
                </td>
                <td>{u.isTrained ? <span className="gt-badge bg-mint/15 text-mint">Trained</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">In training</span>}</td>
                <td>{u.enrollments.length}</td>
                <td className="whitespace-nowrap text-[var(--muted)]">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span className="gt-badge bg-gold/15 text-gold">Never</span>}</td>
                <td>{u.quizAttempts.length > 0 ? <span className="gt-badge bg-orange/15 text-orange">Locked quiz</span> : u.active ? <span className="gt-badge bg-mint/15 text-mint">Active</span> : <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}</td>
                <td><TraineeRowActions userId={u.id} active={u.active} editHref={`/centre/trainees/${u.id}/edit`} /></td>
              </tr>
            ))}
            
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
