import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSIONS, PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const RolePermSchema = z.object({
  roleId: zId,
  permissionId: zId,
  allowed: z.boolean(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // Super-admin-only; check the role too so a stray PERMISSIONS_MANAGE grant
  // to a lower role can't be used to escalate.
  if (session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.PERMISSIONS_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, RolePermSchema);
  if (!parsed.ok) return parsed.response;
  const { roleId, permissionId, allowed } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true, type: true } });
  if (!role) return NextResponse.json({ error: "role not found" }, { status: 404 });
  // The super-admin role must always keep every permission — never let it be
  // weakened (which could lock everyone out of admin functions).
  if (role.type === "SUPER_ADMIN")
    return NextResponse.json({ error: "The super admin role's permissions can't be changed" }, { status: 403 });
  // Only permissions the app still knows. An unknown id used to reach the
  // write and fail on the foreign key as a 500; a retired one (the "view …"
  // toggles nothing checks) would be a switch wired to nothing.
  const permission = await prisma.permission.findUnique({ where: { id: permissionId }, select: { key: true } });
  if (!permission || !ALL_PERMISSIONS.some((p) => p.key === permission.key))
    return NextResponse.json({ error: "permission not found" }, { status: 404 });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId } },
    update: { allowed },
    create: { roleId, permissionId, allowed },
  });
  await audit({
    actorId: session.user.id,
    action: allowed ? "role.permission.allow" : "role.permission.deny",
    target: `role:${role.name}`,
    metadata: { permission: permission.key },
  });
  return NextResponse.json({ ok: true });
}
