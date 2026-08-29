import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canConduct, canViewAllCentres, centreScope } from "@/lib/access";
import { asDate, canScheduleVisits, todayISO } from "@/lib/schedule";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const BookSchema = z.object({
  centreId: z.string().min(1),
  inspectorId: z.string().min(1),
  date: z.string().regex(ISO_DATE),
  note: z.string().max(500).nullish(),
});

/**
 * Visits in the diary.
 *
 * An inspector sees their own. Anyone who can book sees everyone's, within the
 * centres they oversee — a regional manager plans their own patch, not the
 * whole country.
 */
export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? todayISO();
  const to = url.searchParams.get("to");
  const mine = url.searchParams.get("mine") === "1" || !canScheduleVisits(who.viewer.role);

  const visits = await prisma.scheduledVisit.findMany({
    where: {
      AND: [
        mine ? { inspectorId: who.viewer.id } : { centre: centreScope(who.viewer) },
        ISO_DATE.test(from) ? { date: { gte: asDate(from) } } : {},
        to && ISO_DATE.test(to) ? { date: { lte: asDate(to) } } : {},
      ],
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      date: true,
      note: true,
      status: true,
      inspectionId: true,
      centre: { select: { id: true, name: true, size: true } },
      inspector: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(visits);
});

export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canScheduleVisits(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, BookSchema);
  if (!parsed.ok) return parsed.response;
  const { centreId, inspectorId, date, note } = parsed.data;

  // Scoped: a regional manager cannot book a visit at a centre outside their
  // patch by passing its id directly.
  const centre = await prisma.centre.findFirst({
    where: { id: centreId, ...centreScope(who.viewer) },
    select: { id: true, name: true },
  });
  if (!centre) return NextResponse.json({ error: "Unknown centre" }, { status: 404 });

  const inspector = await prisma.user.findUnique({
    where: { id: inspectorId },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!inspector || !inspector.active) return NextResponse.json({ error: "Unknown inspector" }, { status: 404 });
  if (!canConduct(inspector.role))
    return NextResponse.json({ error: `${inspector.name} does not carry out inspections.` }, { status: 400 });

  const existing = await prisma.scheduledVisit.findUnique({
    where: { centreId_inspectorId_date: { centreId, inspectorId, date: asDate(date) } },
    select: { id: true },
  });
  if (existing)
    return NextResponse.json(
      { error: `${inspector.name} is already booked at ${centre.name} that day.`, id: existing.id },
      { status: 409 }
    );

  const visit = await prisma.scheduledVisit.create({
    data: {
      centreId,
      inspectorId,
      date: asDate(date),
      note: note ?? null,
      createdById: who.viewer.id,
    },
    select: { id: true },
  });

  await audit({
    actorId: who.viewer.id,
    action: "visit.book",
    target: visit.id,
    metadata: { centre: centre.name, inspector: inspector.name, date },
  });
  return NextResponse.json(visit, { status: 201 });
});
