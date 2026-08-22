import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canConduct, centreScope, inspectionScope } from "@/lib/access";

const StartSchema = z.object({
  centreId: z.string().min(1),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  /** ISO date (YYYY-MM-DD). Defaults to today. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Inspections this viewer may see, newest first. */
export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const url = new URL(req.url);
  const centreId = url.searchParams.get("centre");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const take = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const inspections = await prisma.inspection.findMany({
    where: {
      AND: [
        inspectionScope(who.viewer),
        centreId ? { centreId } : {},
        from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {},
      ],
    },
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
  const { centreId, size, date } = parsed.data;

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
  const day = new Date(date ?? new Date().toISOString().slice(0, 10));
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

  await audit({
    actorId: who.viewer.id,
    action: "inspection.start",
    target: inspection.id,
    metadata: { centreId, size },
  });
  return NextResponse.json({ id: inspection.id, resumed: false }, { status: 201 });
});
