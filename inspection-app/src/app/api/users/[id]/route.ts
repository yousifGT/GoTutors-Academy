import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson, zName } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageUsers } from "@/lib/access";
import { ASSIGNABLE_ROLES, CENTRE_SCOPED_ROLES, ROLES, isSelfLockout, passwordProblem } from "@/lib/user-rules";

type Ctx = { params: Promise<{ id: string }> };

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  centres: { select: { id: true, name: true } },
  assignedCentres: { select: { id: true, name: true } },
  _count: { select: { inspections: true } },
};

const PatchSchema = z.object({
  name: zName.optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(1).max(200).optional(),
  centreIds: z.array(z.string().min(1)).max(100).optional(),
  assignedCentreIds: z.array(z.string().min(1)).max(100).optional(),
});

export const PATCH = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageUsers(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;
  const { name, role, active, password, centreIds, assignedCentreIds } = parsed.data;

  if (isSelfLockout(who.viewer.id, params.id, { active, role: role as never }))
    return NextResponse.json(
      { error: "You cannot deactivate or demote your own account. Ask another super admin." },
      { status: 400 }
    );

  if (password) {
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const finalRole = (role ?? target.role) as string;
  const centreUpdate =
    centreIds === undefined
      ? undefined
      : CENTRE_SCOPED_ROLES.includes(finalRole as never)
        ? { set: centreIds.map((id) => ({ id })) }
        : { set: [] }; // a role that isn't centre-scoped keeps no centre list

  const assignedUpdate =
    assignedCentreIds === undefined
      ? undefined
      : ASSIGNABLE_ROLES.includes(finalRole as never)
        ? { set: assignedCentreIds.map((id) => ({ id })) }
        : { set: [] };

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name,
      role: role as never,
      active,
      ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
      ...(centreUpdate ? { centres: centreUpdate } : {}),
      ...(assignedUpdate ? { assignedCentres: assignedUpdate } : {}),
    },
    select: publicUser,
  });

  await audit({
    actorId: who.viewer.id,
    action: "user.update",
    target: user.id,
    // Never log the password, only that one was set.
    metadata: { role, active, passwordChanged: !!password },
  });
  return NextResponse.json(user);
});

/**
 * Deactivate rather than delete once someone has carried out inspections: their
 * name is part of the record of those visits, and removing them would either
 * fail on the foreign key or orphan the history.
 */
export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageUsers(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (who.viewer.id === params.id)
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, _count: { select: { inspections: true } } },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (user._count.inspections > 0) {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await audit({ actorId: who.viewer.id, action: "user.deactivate", target: user.id, metadata: { email: user.email } });
    return NextResponse.json({
      ok: true,
      deactivated: true,
      message: `${user.email} has ${user._count.inspections} inspection(s) on record, so the account was deactivated rather than deleted.`,
    });
  }

  await prisma.user.delete({ where: { id: user.id } });
  await audit({ actorId: who.viewer.id, action: "user.delete", target: user.id, metadata: { email: user.email } });
  return NextResponse.json({ ok: true, deactivated: false });
});
