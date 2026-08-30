import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canReadAudit, visibleGroups } from "@/lib/audit-view";
import { AuditBrowser } from "./audit-browser";

export default async function AuditPage() {
  const user = await requireUser();
  if (!canReadAudit(user.role)) redirect("/");

  // Only people who have actually done something appear in the actor filter.
  const actorIds = await prisma.auditLog.findMany({
    where: { actorId: { not: null } },
    distinct: ["actorId"],
    select: { actorId: true },
  });
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds.map((a) => a.actorId!).filter(Boolean) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="mt-6">
      <h1 className="text-2xl font-bold text-navy">Activity</h1>
      <p className="mt-1 text-sm text-slate-500">
        What was done, by whom, and when. Written as it happens and never edited.
        {visibleGroups(user.role).length < 4 && " Account administration is not shown to your role."}
      </p>
      <AuditBrowser groups={visibleGroups(user.role)} actors={actors} />
    </main>
  );
}
