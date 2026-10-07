import { requireRole } from "@/lib/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";
import { reviewQueueWhere } from "@/lib/review-queue";
import { MY_COURSES, SUPER_ADMIN_TITLE, superAdminNav } from "@/lib/nav";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  // Course editing only exists under /instructor, so super admins are sent here
  // from the admin Courses page. Keep their own navigation rather than swapping
  // them into the instructor shell, which looked like a silent role change.
  if (session.user.roleType === "SUPER_ADMIN") {
    return (
      <DashboardShell user={session.user} nav={await superAdminNav(session.user.id)} title={SUPER_ADMIN_TITLE}>
        {children}
      </DashboardShell>
    );
  }
  const [unread, reviewQueue, reports] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    // Super admins returned above with their own shell, so this badge only ever
    // counts the instructor's own courses.
    prisma.quizAttempt.count({ where: reviewQueueWhere(session.user) }),
    prisma.user.count({ where: { supervisorId: session.user.id } }),
  ]);
  const nav = [
    { href: "/instructor", label: "Dashboard", icon: "🏠" },
    { href: "/instructor/courses", label: "Courses", icon: "📚" },
    { href: "/instructor/review", label: "Review queue", badge: reviewQueue, icon: "📝" },
    { href: "/instructor/progress", label: "Trainee progress", icon: "📊" },
    // Always present: any instructor can be assigned a course, not only a
    // promoted teacher who is still training in another field.
    MY_COURSES,
    { href: "/instructor/notifications", label: "Notifications", badge: unread, icon: "🔔" },
    ...(reports > 0 ? [{ href: "/my-team", label: "My team", icon: "🤝" }] : []),
  ];
  return (
    <DashboardShell user={session.user} nav={nav} title="Instructor">
      {children}
    </DashboardShell>
  );
}
