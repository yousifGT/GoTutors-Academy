import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.CENTRE_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { name, location } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const c = await prisma.centre.create({ data: { name, location: location || null } });
  return NextResponse.json(c);
}
