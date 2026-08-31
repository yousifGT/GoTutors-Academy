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
  // What deleting them would take with them, so the screen can say so.
  _count: { select: { inspections: true, deliveries: true, visits: true, uploads: true } },
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
      // An administrator resetting somebody's password, or deactivating them,
      // is very often doing it because that account is believed to be in the
      // wrong hands. Both have to end the sessions it already has, or the change
      // is cosmetic for the next twelve hours.
      ...(password ? { password: await bcrypt.hash(password, 12), sessionsValidFrom: new Date() } : {}),
      ...(active === false ? { sessionsValidFrom: new Date() } : {}),
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
    select: {
      id: true,
      email: true,
      // Everything that would be taken with them. Inspections are the obvious
      // one, but they are not the only history attached to a person.
      _count: { select: { inspections: true, deliveries: true, visits: true, uploads: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  // A centre head has no inspections — they never hold the clipboard — so
  // offboarding one used to fall straight through to a hard delete, and
  // ReportDelivery cascades. That row is the only evidence a report about a
  // children's setting reached the person responsible for it and that they
  // opened it. Deleting the departing head erased, with no warning, the answer
  // to "was the head of centre told about the finding on 3 March?" — the first
  // question anyone asks afterwards. The same applies to an inspector's booked
  // visits and to their uploads.
  const held: string[] = [];
  if (user._count.inspections) held.push(`${user._count.inspections} inspection(s)`);
  if (user._count.deliveries) held.push(`${user._count.deliveries} report delivery record(s)`);
  if (user._count.visits) held.push(`${user._count.visits} booked visit(s)`);
  if (user._count.uploads) held.push(`${user._count.uploads} uploaded photo(s)`);

  if (held.length) {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await audit({
      actorId: who.viewer.id,
      action: "user.deactivate",
      target: user.id,
      metadata: { email: user.email, held: held.join(", ") },
    });
    return NextResponse.json({
      ok: true,
      deactivated: true,
      message: `${user.email} has ${held.join(", ")} on record, so the account was deactivated rather than deleted. They can no longer sign in.`,
    });
  }

  await prisma.user.delete({ where: { id: user.id } });
  await audit({ actorId: who.viewer.id, action: "user.delete", target: user.id, metadata: { email: user.email } });
  return NextResponse.json({ ok: true, deactivated: false });
});
