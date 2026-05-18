import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { roleId, name } = await req.json();
  if (!roleId || !name?.trim()) return NextResponse.json({ error: "roleId and name required" }, { status: 400 });

  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  try {
    const sp = await prisma.subPosition.create({ data: { roleId, name: name.trim() } });
    await audit({
      actorId: session.user.id,
      action: "sub-position.create",
      target: `${role.name}:${sp.name}`,
    });
    return NextResponse.json({ id: sp.id });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Sub-position with that name already exists for this role" }, { status: 409 });
    throw e;
  }
}
