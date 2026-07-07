import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const NotificationSchema = z.object({ read: z.boolean() });

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const n = await prisma.notification.findUnique({ where: { id: params.id } });
  if (!n || n.userId !== session.user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = await parseJson(req, NotificationSchema);
  if (!parsed.ok) return parsed.response;

  await prisma.notification.update({ where: { id: n.id }, data: { read: parsed.data.read } });
  return NextResponse.json({ ok: true });
});
