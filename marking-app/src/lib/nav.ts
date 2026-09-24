import { prisma } from "@/lib/prisma";
import { submissionScope } from "@/lib/marking/access";
import { WAITING_ON_HUMAN } from "@/lib/marking/view";
import type { NavItem } from "@/components/app-shell";
import type { Viewer } from "@/lib/session";

/**
 * One builder for the sidebar, so the app looks the same from every page.
 *
 * Two badges, both counts of unfinished work: papers waiting on a person to
 * mark them, and papers nobody has filed against a student yet. Quick marking
 * defers that filing decision on purpose, so something has to keep asking.
 */
export async function navFor(viewer: Viewer): Promise<NavItem[]> {
  const [waiting, unstored] = await Promise.all([
    prisma.submission.count({ where: { ...submissionScope(viewer), status: { in: WAITING_ON_HUMAN } } }),
    prisma.submission.count({ where: { ...submissionScope(viewer), studentId: null } }),
  ]);

  return [
    { href: "/", label: "Dashboard", icon: "🏠" },
    { href: "/quick", label: "Quick marking", icon: "⚡" },
    { href: "/upload", label: "Mark for a student", icon: "📷" },
    { href: "/queue", label: "Needs marking", icon: "🖊️", badge: waiting },
    { href: "/unfiled", label: "Not stored yet", icon: "📥", badge: unstored },
    { href: "/students", label: "Students", icon: "🧒" },
    { href: "/schemes", label: "Mark schemes", icon: "📋" },
    ...(viewer.role === "ADMIN" ? [{ href: "/team", label: "Team", icon: "👥" }] : []),
  ];
}
