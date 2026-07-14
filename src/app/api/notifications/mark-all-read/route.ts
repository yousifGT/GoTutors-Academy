import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";

export const POST = withRoute(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  await prisma.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } });
  return NextResponse.json({ ok: true });
});
