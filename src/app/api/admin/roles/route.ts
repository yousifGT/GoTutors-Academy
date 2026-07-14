import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const RoleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["SUPER_ADMIN", "CENTRE_ADMIN", "INSTRUCTOR", "TRAINEE"]),
  description: z.string().max(1000).nullish(),
});

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, RoleSchema);
  if (!parsed.ok) return parsed.response;
  const { name, type, description } = parsed.data;

  try {
    const role = await prisma.role.create({
      data: { name, type, description: description ?? null },
    });

    // Seed default permissions for this type
    const perms = await prisma.permission.findMany();
    const allowed = DEFAULT_ROLE_PERMISSIONS[type] ?? [];
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
        allowed: allowed.includes(p.key as any),
      })),
    });

    await audit({ actorId: session.user.id, action: "role.create", target: `role:${role.name}`, metadata: { type } });
    return NextResponse.json({ id: role.id });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Role name already in use" }, { status: 409 });
    throw e;
  }
}
