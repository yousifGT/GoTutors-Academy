import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";

export default async function CentreLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const [unread, reports] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    prisma.user.count({ where: { supervisorId: session.user.id } }),
  ]);
  const nav = [
    { href: "/centre", label: "Dashboard", icon: "🏠" },
    { href: "/centre/trainees", label: "Trainees", icon: "👥" },
    { href: "/centre/reports", label: "Reports", icon: "📊" },
    { href: "/centre/notifications", label: "Notifications", badge: unread, icon: "🔔" },
    ...(reports > 0 ? [{ href: "/my-team", label: "My team", icon: "🤝" }] : []),
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Centre admin">
      {children}
    </DashboardShell>
  );
}
