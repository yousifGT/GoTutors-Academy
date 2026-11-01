import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSIONS, PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const UserPermSchema = z.object({
  userId: zId,
  permissionId: zId,
  value: z.enum(["allow", "deny", "inherit"]),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // Managing permissions is super-admin-only. Check the role too (not just the
  // permission) so that if PERMISSIONS_MANAGE is ever granted to a lower role,
  // it still can't be used to self-escalate.
  if (session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.PERMISSIONS_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, UserPermSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, permissionId, value } = parsed.data;

  // Never let an admin edit their own permission overrides (no self-escalation).
  if (userId === session.user.id)
    return NextResponse.json({ error: "You can't change your own permissions" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  // Only permissions the app still knows. An unknown id used to reach the
  // write and fail on the foreign key as a 500; a retired one (the "view …"
  // toggles nothing checks) would be a switch wired to nothing.
  const permission = await prisma.permission.findUnique({ where: { id: permissionId }, select: { key: true } });
  if (!permission || !ALL_PERMISSIONS.some((p) => p.key === permission.key))
    return NextResponse.json({ error: "permission not found" }, { status: 404 });

  if (value === "inherit") {
    await prisma.userPermissionOverride.deleteMany({ where: { userId, permissionId } });
  } else {
    await prisma.userPermissionOverride.upsert({
      where: { userId_permissionId: { userId, permissionId } },
      update: { allowed: value === "allow" },
      create: { userId, permissionId, allowed: value === "allow" },
    });
  }
  await audit({
    actorId: session.user.id,
    action: `user.permission.${value}`,
    target: `user:${target.email}`,
    metadata: { permission: permission.key },
  });
  return NextResponse.json({ ok: true });
}
