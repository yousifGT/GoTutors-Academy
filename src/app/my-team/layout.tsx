import { requireSession } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";
import { roleDashboard } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MyTeamLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const reportsCount = await prisma.user.count({ where: { supervisorId: session.user.id } });
  if (reportsCount === 0) redirect(roleDashboard[session.user.roleType]);

  const nav = [
    { href: roleDashboard[session.user.roleType], label: "Back to dashboard", icon: "↩️" },
    { href: "/my-team", label: "My team", icon: "🤝" },
    { href: "/my-team/certificates", label: "Team certificates", icon: "🎓" },
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Supervisor">
      {children}
    </DashboardShell>
  );
}
