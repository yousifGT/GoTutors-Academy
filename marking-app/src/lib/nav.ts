import { prisma } from "@/lib/prisma";
import { submissionScope } from "@/lib/marking/access";
import { WAITING_ON_HUMAN } from "@/lib/marking/view";
import type { NavItem } from "@/components/app-shell";
import type { Viewer } from "@/lib/session";

/**
 * One builder for the sidebar, so the app looks the same from every page.
 *
 * The only badge is the number of papers waiting on a person — the one thing in
 * here that is genuinely time-sensitive, and the number an admin opens the app
 * to see.
 */
export async function navFor(viewer: Viewer): Promise<NavItem[]> {
  const waiting = await prisma.submission.count({
    where: { ...submissionScope(viewer), status: { in: WAITING_ON_HUMAN } },
  });

  return [
    { href: "/", label: "Dashboard", icon: "🏠" },
    { href: "/upload", label: "Mark a paper", icon: "📷" },
    { href: "/queue", label: "Needs marking", icon: "🖊️", badge: waiting },
    { href: "/students", label: "Students", icon: "🧒" },
    { href: "/schemes", label: "Mark schemes", icon: "📋" },
    ...(viewer.role === "ADMIN" ? [{ href: "/team", label: "Team", icon: "👥" }] : []),
  ];
}
