import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/centres", label: "Centres" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/roles", label: "Roles & Sub-positions" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("SUPER_ADMIN");
  return (
    <DashboardShell user={session.user} nav={nav} title="Super admin">
      {children}
    </DashboardShell>
  );
}
