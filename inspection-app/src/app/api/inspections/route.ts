import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canConduct, centreScope } from "@/lib/access";
import { inspectionWhere, parseInspectionFilters } from "@/lib/inspection-query";

const StartSchema = z.object({
  centreId: z.string().min(1),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
});

/**
 * An inspection is dated the day it is carried out, and the client does not get
 * to say when that was.
 *
 * The field used to be accepted from the request. Nothing sent it, but an
 * inspector — the largest role, signed in on a personal phone — could post a
 * date of their choosing, and the visit booked for that day was then marked
 * DONE with no person recorded as having marked it. A centre could be dropped
 * off the overdue list for a year by one request, and the record would read as
 * though the system had worked it out itself.
 */
function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/** Inspections this viewer may see, newest first. */
export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const url = new URL(req.url);
  const filters = parseInspectionFilters(url);
  const take = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  const inspections = await prisma.inspection.findMany({
    where: inspectionWhere(who.viewer, filters),
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      date: true,
      size: true,
      status: true,
      scorePct: true,
      verdict: true,
      activeMs: true,
      centre: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
      // Only this viewer's own delivery, so "unread" means unread by them.
      deliveries: {
        where: { userId: who.viewer.id },
        select: { deliveredAt: true, readAt: true },
      },
    },
  });
  return NextResponse.json(inspections);
});

/**
 * Start an inspection. It opens as a draft with no answers; the inspector fills
 * it in over the session and PATCHes as they go.
 *
 * The size is recorded on the inspection rather than read from the centre,
 * because an inspector may find a centre bigger or smaller than its default on
 * the day — and the size decides how some questions are marked.
 */
export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canConduct(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, StartSchema);
  if (!parsed.ok) return parsed.response;
  const { centreId, size } = parsed.data;

  // Scoped lookup: a regional manager cannot open a visit at a centre that
  // isn't theirs by passing its id directly.
  const centre = await prisma.centre.findFirst({
    where: { id: centreId, ...centreScope(who.viewer) },
    select: { id: true },
  });
  if (!centre) return NextResponse.json({ error: "Unknown centre" }, { status: 404 });

  const template = await prisma.template.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!template)
    return NextResponse.json({ error: "No active checklist. Run: npm run db:seed" }, { status: 409 });

  // One open draft per inspector per centre per day — reopening the app should
  // resume the visit in progress, not start a second one beside it.
  const day = today();
  const existing = await prisma.inspection.findFirst({
    where: { centreId, inspectorId: who.viewer.id, date: day, status: "DRAFT" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ id: existing.id, resumed: true });

  const inspection = await prisma.inspection.create({
    data: {
      centreId,
      templateId: template.id,
      inspectorId: who.viewer.id,
      size,
      date: day,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  // If this visit was in the diary, tie the two together: a planned day and the
  // record of what happened should be one story, not two lists to reconcile by
  // eye. Nothing depends on a booking existing — an unplanned visit is normal.
  // Only a visit that is still outstanding. Without `status: "PLANNED"` a day
  // already settled as MISSED would be quietly rewritten to DONE by starting an
  // inspection, erasing the fact that it was missed — which is the thing the
  // status exists to record.
  await prisma.scheduledVisit.updateMany({
    where: { centreId, inspectorId: who.viewer.id, date: day, inspectionId: null, status: "PLANNED" },
    data: { inspectionId: inspection.id, status: "DONE" },
  });

  await audit({
    actorId: who.viewer.id,
    action: "inspection.start",
    target: inspection.id,
    metadata: { centreId, size },
  });
  return NextResponse.json({ id: inspection.id, resumed: false }, { status: 201 });
});
