import { prisma } from "@/lib/prisma";
import { requirePermission, requireRole } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/page-ui";

export default async function InstructorNotificationsPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  await requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW); // same check as this page's API
  const items = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" subtitle="Everything that needs your attention." />
      <NotificationsList
      initial={items.map((n) => ({
        id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read,
        createdAt: n.createdAt.toISOString(),
      }))}
      />
    </div>
  );
}
