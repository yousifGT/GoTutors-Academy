import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.PERMISSIONS_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { roleId, permissionId, allowed } = await req.json();
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId } },
    update: { allowed: !!allowed },
    create: { roleId, permissionId, allowed: !!allowed },
  });
  const [role, perm] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }),
    prisma.permission.findUnique({ where: { id: permissionId }, select: { key: true } }),
  ]);
  await audit({
    actorId: session.user.id,
    action: allowed ? "role.permission.allow" : "role.permission.deny",
    target: `role:${role?.name ?? roleId}`,
    metadata: { permission: perm?.key ?? permissionId },
  });
  return NextResponse.json({ ok: true });
}
