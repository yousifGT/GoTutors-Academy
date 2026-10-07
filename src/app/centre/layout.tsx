import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { CENTRE_ADMIN_TITLE, SUPER_ADMIN_TITLE, centreAdminNav, superAdminNav } from "@/lib/nav";

export default async function CentreLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  if (session.user.roleType === "SUPER_ADMIN") {
    return (
      <DashboardShell user={session.user} nav={await superAdminNav(session.user.id)} title={SUPER_ADMIN_TITLE}>
        {children}
      </DashboardShell>
    );
  }
  return (
    <DashboardShell user={session.user} nav={await centreAdminNav(session.user.id)} title={CENTRE_ADMIN_TITLE}>
      {children}
    </DashboardShell>
  );
}
