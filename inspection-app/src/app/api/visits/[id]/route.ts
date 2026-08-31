import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { centreScope } from "@/lib/access";
import { canScheduleVisits, statusChangeProblem } from "@/lib/schedule";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  note: z.string().max(500).nullish(),
  status: z.enum(["PLANNED", "DONE", "MISSED", "CANCELLED"]).optional(),
  /** Required when marking a visit missed. */
  reason: z.string().max(500).nullish(),
});

/**
 * Change a booking, including settling what happened on the day.
 *
 * Starting an inspection marks a visit done on its own. This is for the days
 * that need a person: nobody turned up, or they did and it was recorded on
 * paper. Marking someone missed demands a reason and records who decided it, so
 * a mark against an inspector's name always says who made it and why.
 *
 * The one thing that cannot be overridden is an inspection already on the
 * record: it is evidence the visit happened, and no status may contradict it.
 */
export const PATCH = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canScheduleVisits(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  const visit = await prisma.scheduledVisit.findFirst({
    where: { AND: [{ id: params.id }, { centre: centreScope(who.viewer) }] },
    select: { id: true, inspectionId: true, date: true, inspector: { select: { name: true } } },
  });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { note, status, reason } = parsed.data;

  if (status) {
    const problem = statusChangeProblem(
      status,
      { hasInspection: visit.inspectionId !== null, date: visit.date },
      reason
    );
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  }

  const updated = await prisma.scheduledVisit.update({
    where: { id: visit.id },
    data: {
      ...(note !== undefined ? { note } : {}),
      ...(status
        ? {
            status,
            statusReason: reason?.trim() || null,
            statusSetById: who.viewer.id,
            statusSetAt: new Date(),
          }
        : {}),
    },
  });

  await audit({
    actorId: who.viewer.id,
    action: status ? `visit.${status.toLowerCase()}` : "visit.update",
    target: visit.id,
    metadata: { inspector: visit.inspector.name, date: visit.date.toISOString().slice(0, 10), status, reason },
  });
  return NextResponse.json(updated);
});

export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canScheduleVisits(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const visit = await prisma.scheduledVisit.findFirst({
    where: { AND: [{ id: params.id }, { centre: centreScope(who.viewer) }] },
    select: { id: true, inspectionId: true },
  });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (visit.inspectionId)
    return NextResponse.json(
      { error: "That visit has been carried out — it is part of the record now. Cancel a future one instead." },
      { status: 409 }
    );

  await prisma.scheduledVisit.delete({ where: { id: visit.id } });
  await audit({ actorId: who.viewer.id, action: "visit.delete", target: visit.id });
  return NextResponse.json({ ok: true });
});
