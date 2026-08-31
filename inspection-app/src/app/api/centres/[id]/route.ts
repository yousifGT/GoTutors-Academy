import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson, zName } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageCentres } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  name: zName.optional(),
  address: z.string().max(300).nullish(),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]).nullish(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Who is responsible for this centre — they read its inspections and receive its reports. */
  managerIds: z.array(z.string().min(1)).max(50).optional(),
  /** Who is expected to visit it. Does not restrict where they may inspect. */
  inspectorIds: z.array(z.string().min(1)).max(50).optional(),
});

export const PATCH = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageCentres(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  const { managerIds, inspectorIds, ...fields } = parsed.data;
  const centre = await prisma.centre.update({
    where: { id: params.id },
    data: {
      ...fields,
      ...(managerIds ? { managers: { set: managerIds.map((id) => ({ id })) } } : {}),
      ...(inspectorIds ? { inspectors: { set: inspectorIds.map((id) => ({ id })) } } : {}),
    },
    include: {
      managers: { select: { id: true, name: true, role: true } },
      inspectors: { select: { id: true, name: true, role: true } },
    },
  });
  await audit({ actorId: who.viewer.id, action: "centre.update", target: centre.id, metadata: parsed.data });
  return NextResponse.json(centre);
});

/**
 * Close rather than delete once a centre has been inspected. Those inspections
 * are the record of visits that happened; deleting the centre would take them
 * with it. Closing keeps the history and takes the centre off the picker.
 */
export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageCentres(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const centre = await prisma.centre.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, _count: { select: { inspections: true } } },
  });
  if (!centre) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (centre._count.inspections > 0) {
    await prisma.centre.update({ where: { id: centre.id }, data: { status: "CLOSED" } });
    await audit({ actorId: who.viewer.id, action: "centre.close", target: centre.id, metadata: { name: centre.name } });
    return NextResponse.json({
      ok: true,
      closed: true,
      message: `${centre.name} has ${centre._count.inspections} inspection(s) on record, so it was closed rather than deleted.`,
    });
  }

  await prisma.centre.delete({ where: { id: centre.id } });
  await audit({ actorId: who.viewer.id, action: "centre.delete", target: centre.id, metadata: { name: centre.name } });
  return NextResponse.json({ ok: true, closed: false });
});
