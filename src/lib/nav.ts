import type { NavItem } from "@/components/dashboard-shell";
import { prisma } from "@/lib/prisma";

/**
 * Navigation belongs to who you are, not to which part of the app you happen to
 * be looking at.
 *
 * Each section used to build its own sidebar, so a super admin following a link
 * into /instructor (the only place courses can be edited) lost the admin
 * navigation entirely and the header started calling them "Instructor". Nothing
 * about their permissions had changed, but it read as being silently switched
 * to another role, with Users, Centres and the rest simply gone.
 *
 * A super admin therefore gets the same sidebar everywhere, including the
 * sections they are only visiting. It has to be *identical* in every section —
 * a sidebar that gains or loses an entry as you move around reintroduces the
 * same confusion in a smaller form.
 */

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠" },
  { href: "/admin/centres", label: "Centres", icon: "🏫" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/courses", label: "Courses", icon: "📚" },
  { href: "/admin/roles", label: "Roles & Sub-positions", icon: "🧩" },
  { href: "/admin/reports", label: "Reports", icon: "📊" },
  { href: "/admin/permissions", label: "Permissions", icon: "🔐" },
  { href: "/admin/audit", label: "Audit log", icon: "📜" },
];

export const SUPER_ADMIN_TITLE = "Super admin";

/**
 * The admin sidebar plus the review queue — the one working page a super admin
 * needs regularly that has no equivalent under /admin.
 */
export async function superAdminNav(): Promise<NavItem[]> {
  const reviewQueue = await prisma.quizAttempt.count({ where: { needsReview: true, reviewedAt: null } });
  return [...ADMIN_NAV, { href: "/instructor/review", label: "Review queue", icon: "📝", badge: reviewQueue }];
}
