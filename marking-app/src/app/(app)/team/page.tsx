import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const viewer = await requireAdmin();
  const members = await prisma.user.findMany({
    where: { organisationId: viewer.organisationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      lastLoginAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="Who can mark, and what they can see." backHref="/" backLabel="Dashboard" />
      <TeamManager
        currentUserId={viewer.id}
        members={members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
