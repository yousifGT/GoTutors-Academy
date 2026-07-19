import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const reports = await prisma.user.count({ where: { supervisorId: session.user.id } });
  const nav = [
    { href: "/trainee", label: "Dashboard", icon: "🏠" },
    { href: "/trainee/courses", label: "My Courses", icon: "📚" },
    { href: "/trainee/certificates", label: "Certificates", icon: "🎓" },
    ...(reports > 0 ? [{ href: "/my-team", label: "My team", icon: "🤝" }] : []),
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Trainee">
      {children}
    </DashboardShell>
  );
}
