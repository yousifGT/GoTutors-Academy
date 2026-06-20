import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

async function authorize(session: any, target: { centreId: string | null }) {
  if (session.user.roleType === "SUPER_ADMIN") return true;
  if (session.user.roleType === "CENTRE_ADMIN" && session.user.centreId === target.centreId) return true;
  return false;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(session, target))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const desiredRoleId = body.roleId ?? target.roleId;
  if (body.subPosition) {
    const exists = await prisma.subPosition.findFirst({
      where: { roleId: desiredRoleId, name: body.subPosition },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Sub-position does not exist for this role" }, { status: 400 });
  }

  // Only super admins may change role or isTrained
  if ((body.roleId || "isTrained" in body) && session.user.roleType !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only super admins can change role or training status" }, { status: 403 });
  }

  const data: any = {};
  for (const k of ["name", "email", "position", "subPosition", "isTrained", "active", "roleId", "centreId", "supervisorId"] as const) {
    if (k in body) data[k] = body[k];
  }
  if (body.password) data.password = await bcrypt.hash(body.password, 12);

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await authorize(session, target))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
