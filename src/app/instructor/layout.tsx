import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const [unread, reviewQueue, reports] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    prisma.quizAttempt.count({
      where: {
        needsReview: true,
        reviewedAt: null,
        ...(session.user.roleType === "SUPER_ADMIN"
          ? {}
          : { quiz: { lesson: { module: { course: { authorId: session.user.id } } } } }),
      },
    }),
    prisma.user.count({ where: { supervisorId: session.user.id } }),
  ]);
  const nav = [
    { href: "/instructor", label: "Dashboard", icon: "🏠" },
    { href: "/instructor/dashboard-demo", label: "Demo dashboard", icon: "🧪" },
    { href: "/instructor/courses", label: "Courses", icon: "📚" },
    { href: "/instructor/review", label: "Review queue", badge: reviewQueue, icon: "📝" },
    { href: "/instructor/progress", label: "Trainee progress", icon: "📊" },
    { href: "/instructor/notifications", label: "Notifications", badge: unread, icon: "🔔" },
    ...(reports > 0 ? [{ href: "/my-team", label: "My team", icon: "🤝" }] : []),
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Instructor">
      {children}
    </DashboardShell>
  );
}
