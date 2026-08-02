import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";
import { SUPER_ADMIN_TITLE, superAdminNav } from "@/lib/nav";

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  if (session.user.roleType === "SUPER_ADMIN") {
    return (
      <DashboardShell user={session.user} nav={await superAdminNav()} title={SUPER_ADMIN_TITLE}>
        {children}
      </DashboardShell>
    );
  }
  const reports = await prisma.user.count({ where: { supervisorId: session.user.id } });
  const nav = [
    { href: "/trainee", label: "Dashboard", icon: "🏠" },
    { href: "/trainee/courses", label: "My Courses", icon: "📚" },
    { href: "/trainee/certificates", label: "Certificates", icon: "🎓" },
    // A promoted teacher browsing their remaining lessons can hop back to teaching.
    ...(session.user.roleType === "INSTRUCTOR" ? [{ href: "/instructor", label: "Teaching", icon: "🧑‍🏫" }] : []),
    ...(reports > 0 ? [{ href: "/my-team", label: "My team", icon: "🤝" }] : []),
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Trainee">
      {children}
    </DashboardShell>
  );
}
