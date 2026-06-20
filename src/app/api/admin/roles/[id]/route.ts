import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const RoleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
  })
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: "nothing to update",
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, RoleUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const data: { name?: string; description?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  // `type` is intentionally immutable — it's load-bearing for routing/permissions.

  try {
    const role = await prisma.role.update({ where: { id: params.id }, data });
    await audit({ actorId: session.user.id, action: "role.update", target: `role:${role.name}` });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Role name already in use" }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const userCount = await prisma.user.count({ where: { roleId: params.id } });
  if (userCount > 0) {
    return NextResponse.json({ error: `Cannot delete: ${userCount} user(s) assigned to this role.`, userCount }, { status: 409 });
  }
  const role = await prisma.role.findUnique({ where: { id: params.id } });
  if (!role) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.role.delete({ where: { id: params.id } });
  await audit({ actorId: session.user.id, action: "role.delete", target: `role:${role.name}` });
  return NextResponse.json({ ok: true });
}
