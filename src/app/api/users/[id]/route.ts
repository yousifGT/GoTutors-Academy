import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zId, zName, zEmail, zPassword } from "@/lib/validate";

const UpdateUserSchema = z.object({
  name: zName.optional(),
  email: zEmail.optional(),
  position: z.string().max(200).nullable().optional(),
  subPosition: z.string().max(200).nullable().optional(),
  isTrained: z.boolean().optional(),
  active: z.boolean().optional(),
  roleId: zId.optional(),
  centreId: zId.nullable().optional(),
  supervisorId: zId.nullable().optional(),
  password: zPassword.optional(),
});

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

  const parsed = await parseJson(req, UpdateUserSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const desiredRoleId = body.roleId ?? target.roleId;
  if (body.subPosition) {
    const exists = await prisma.subPosition.findFirst({
      where: { roleId: desiredRoleId, name: body.subPosition },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Sub-position does not exist for this role" }, { status: 400 });
  }

  // Only super admins may change a user's role, training status, or centre.
  // The edit form always submits these fields, so compare against the current
  // values and reject only genuine changes — otherwise a centre admin couldn't
  // save any edit, and (without the centre check) could move users between
  // centres or escalate roles.
  const isSuper = session.user.roleType === "SUPER_ADMIN";
  const changingRole = body.roleId !== undefined && body.roleId !== target.roleId;
  const changingTrained = body.isTrained !== undefined && body.isTrained !== target.isTrained;
  const changingCentre = body.centreId !== undefined && (body.centreId ?? null) !== target.centreId;
  if (!isSuper && (changingRole || changingTrained || changingCentre)) {
    return NextResponse.json({ error: "Only super admins can change role, training status, or centre" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  for (const k of ["name", "email", "position", "subPosition", "isTrained", "active", "roleId", "centreId", "supervisorId"] as const) {
    if (body[k] !== undefined) data[k] = body[k];
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
