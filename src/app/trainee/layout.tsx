import { LEARNER_ROLES, requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";
import { CENTRE_ADMIN_TITLE, SUPER_ADMIN_TITLE, centreAdminNav, superAdminNav } from "@/lib/nav";

export default async function TraineeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(...LEARNER_ROLES);
  // Admins reach these pages through My courses. They keep their own sidebar —
  // taking a course does not make them a trainee, and swapping the navigation
  // reads as a silent role change (see src/lib/nav.ts).
  if (session.user.roleType === "SUPER_ADMIN") {
    return (
      <DashboardShell user={session.user} nav={await superAdminNav(session.user.id)} title={SUPER_ADMIN_TITLE}>
        {children}
      </DashboardShell>
    );
  }
  if (session.user.roleType === "CENTRE_ADMIN") {
    return (
      <DashboardShell user={session.user} nav={await centreAdminNav(session.user.id)} title={CENTRE_ADMIN_TITLE}>
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
