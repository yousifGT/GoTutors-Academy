import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { Prisma, RoleType } from "@prisma/client";
import { z } from "zod";
import { parseJson, zId, zName, zEmail, zPassword } from "@/lib/validate";
import { canManageUser } from "@/lib/scope";

/** Thrown inside the delete transaction to roll back when no other admin remains. */
class LastSuperAdminError extends Error {}

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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: { select: { type: true } } },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canManageUser(session.user, { roleType: target.role.type, centreId: target.centreId }))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

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

  // Reject a duplicate email up front so the form can show a field error
  // (otherwise the unique constraint throws an unhandled 500 on update).
  if (body.email !== undefined && body.email !== target.email) {
    const dupe = await prisma.user.findFirst({
      where: { email: body.email, id: { not: params.id } },
      select: { id: true },
    });
    if (dupe) {
      return NextResponse.json(
        { error: "Email already in use", details: { email: ["Email already in use"] } },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  for (const k of ["name", "email", "position", "subPosition", "isTrained", "active", "roleId", "centreId", "supervisorId"] as const) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.password) data.password = await bcrypt.hash(body.password, 12);

  try {
    const updated = await prisma.user.update({ where: { id: params.id }, data });
    return NextResponse.json({ id: updated.id });
  } catch (e) {
    // Safety net for a race between the pre-check above and the write.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Email already in use", details: { email: ["Email already in use"] } },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // An admin must not delete their own account mid-session.
  if (params.id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: { select: { type: true } } },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canManageUser(session.user, { roleType: target.role.type, centreId: target.centreId }))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Never delete the last super admin. Count the other super admins and delete
  // in one serializable transaction so a concurrent delete can't race past the
  // check and leave the system with zero admins.
  if (target.role.type === RoleType.SUPER_ADMIN) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const otherSuperAdmins = await tx.user.count({
            where: { role: { type: RoleType.SUPER_ADMIN }, id: { not: params.id } },
          });
          if (otherSuperAdmins === 0) throw new LastSuperAdminError();
          await tx.user.delete({ where: { id: params.id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (e) {
      if (e instanceof LastSuperAdminError)
        return NextResponse.json({ error: "Cannot delete the last super admin" }, { status: 409 });
      // A serializable conflict means a concurrent delete touched the admin set.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034")
        return NextResponse.json({ error: "Concurrent update, please retry" }, { status: 409 });
      throw e;
    }
    return NextResponse.json({ ok: true });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
