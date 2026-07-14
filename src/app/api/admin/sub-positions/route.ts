import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const SubPositionSchema = z.object({ roleId: zId, name: z.string().trim().min(1).max(200) });

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, SubPositionSchema);
  if (!parsed.ok) return parsed.response;
  const { roleId, name } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  try {
    const sp = await prisma.subPosition.create({ data: { roleId, name } });
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
