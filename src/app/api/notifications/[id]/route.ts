import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const n = await prisma.notification.findUnique({ where: { id: params.id } });
  if (!n || n.userId !== session.user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  await prisma.notification.update({ where: { id: n.id }, data: { read: !!body.read } });
  return NextResponse.json({ ok: true });
}
