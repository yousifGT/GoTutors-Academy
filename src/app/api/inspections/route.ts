import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { inspectionAccess, inspectionScope } from "@/lib/inspection/access";

const SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;

const StartSchema = z.object({
  centreId: z.string().min(1),
  size: z.enum(SIZES),
  /** ISO date (YYYY-MM-DD). Defaults to today. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Inspections this viewer may see, newest first. */
export const GET = withRoute(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const access = await inspectionAccess(session.user.id);
  const url = new URL(req.url);
  const centreId = url.searchParams.get("centre");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const take = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const inspections = await prisma.inspection.findMany({
    where: {
      AND: [
        inspectionScope({ id: session.user.id, centreId: session.user.centreId }, access),
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
 * The size is recorded on the inspection, not read from the centre, because an
 * inspector may find a centre bigger or smaller than its default on the day —
 * and the size decides how some questions are marked.
 */
export const POST = withRoute(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const access = await inspectionAccess(session.user.id);
  if (!access.conduct) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, StartSchema);
  if (!parsed.ok) return parsed.response;
  const { centreId, size, date } = parsed.data;

  const centre = await prisma.centre.findUnique({ where: { id: centreId }, select: { id: true } });
  if (!centre) return NextResponse.json({ error: "Unknown centre" }, { status: 404 });

  const template = await prisma.inspectionTemplate.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!template)
    return NextResponse.json(
      { error: "No active checklist. Run: npm run db:seed:inspection" },
      { status: 409 }
    );

  // One open draft per inspector per centre per day — reopening the app should
  // resume the visit in progress, not start a second one beside it.
  const day = new Date(date ?? new Date().toISOString().slice(0, 10));
  const existing = await prisma.inspection.findFirst({
    where: { centreId, inspectorId: session.user.id, date: day, status: "DRAFT" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ id: existing.id, resumed: true }, { status: 200 });

  const inspection = await prisma.inspection.create({
    data: {
      centreId,
      templateId: template.id,
      inspectorId: session.user.id,
      size,
      date: day,
      startedAt: new Date(),
      status: "DRAFT",
    },
    select: { id: true },
  });

  await audit({
    actorId: session.user.id,
    action: "inspection.start",
    target: inspection.id,
    metadata: { centreId, size },
  });

  return NextResponse.json({ id: inspection.id, resumed: false }, { status: 201 });
});
