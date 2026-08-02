import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { SUPER_ADMIN_TITLE, superAdminNav } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("SUPER_ADMIN");
  return (
    <DashboardShell user={session.user} nav={await superAdminNav()} title={SUPER_ADMIN_TITLE}>
      {children}
    </DashboardShell>
  );
}
