import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { centreScope } from "@/lib/access";
import { canScheduleVisits } from "@/lib/schedule";

type Ctx = { params: { id: string } };

const PatchSchema = z.object({
  note: z.string().max(500).nullish(),
  status: z.enum(["PLANNED", "CANCELLED"]).optional(),
});

/**
 * Change a booking. Only PLANNED and CANCELLED are settable: DONE and MISSED
 * describe what happened, and are decided by whether an inspection exists, not
 * by anyone's opinion.
 */
export const PATCH = withRoute(async (req: Request, { params }: Ctx) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canScheduleVisits(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  const visit = await prisma.scheduledVisit.findFirst({
    where: { AND: [{ id: params.id }, { centre: centreScope(who.viewer) }] },
    select: { id: true, inspectionId: true },
  });
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (visit.inspectionId && parsed.data.status === "CANCELLED")
    return NextResponse.json({ error: "That visit has already been carried out." }, { status: 409 });

  const updated = await prisma.scheduledVisit.update({ where: { id: visit.id }, data: parsed.data });
  await audit({ actorId: who.viewer.id, action: "visit.update", target: visit.id, metadata: parsed.data });
  return NextResponse.json(updated);
});

export const DELETE = withRoute(async (_req: Request, { params }: Ctx) => {
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
