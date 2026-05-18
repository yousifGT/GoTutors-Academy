import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { NotificationsList } from "@/components/notifications-list";

export default async function CentreNotificationsPage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  const items = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <NotificationsList
      initial={items.map((n) => ({
        id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
