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

  const { userId, permissionId, value } = (await req.json()) as { userId: string; permissionId: string; value: "allow" | "deny" | "inherit" };

  if (value === "inherit") {
    await prisma.userPermissionOverride.deleteMany({ where: { userId, permissionId } });
  } else {
    await prisma.userPermissionOverride.upsert({
      where: { userId_permissionId: { userId, permissionId } },
      update: { allowed: value === "allow" },
      create: { userId, permissionId, allowed: value === "allow" },
    });
  }
  const [target, perm] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.permission.findUnique({ where: { id: permissionId }, select: { key: true } }),
  ]);
  await audit({
    actorId: session.user.id,
    action: `user.permission.${value}`,
    target: `user:${target?.email ?? userId}`,
    metadata: { permission: perm?.key ?? permissionId },
  });
  return NextResponse.json({ ok: true });
}
