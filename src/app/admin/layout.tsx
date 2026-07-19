import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";

const nav = [
  { href: "/admin", label: "Dashboard", icon: "🏠" },
  { href: "/admin/centres", label: "Centres", icon: "🏫" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/courses", label: "Courses", icon: "📚" },
  { href: "/admin/roles", label: "Roles & Sub-positions", icon: "🧩" },
  { href: "/admin/reports", label: "Reports", icon: "📊" },
  { href: "/admin/permissions", label: "Permissions", icon: "🔐" },
  { href: "/admin/audit", label: "Audit log", icon: "📜" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("SUPER_ADMIN");
  return (
    <DashboardShell user={session.user} nav={nav} title="Super admin">
      {children}
    </DashboardShell>
  );
}
