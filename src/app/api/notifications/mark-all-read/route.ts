import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export const POST = withRoute(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // Same permission as the notifications pages.
  if (!(await userHasPermission(session.user.id, PERMISSIONS.NOTIFICATIONS_VIEW)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } });
  return NextResponse.json({ ok: true });
});
