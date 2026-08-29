import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";
import { centreScope } from "@/lib/access";
import { OVERDUE_DAYS, coverage, todayISO } from "@/lib/schedule";

/**
 * Which centres need a visit.
 *
 * One row per centre this viewer can see: when it was last inspected, how long
 * ago, and whether anything is already booked. Worst first.
 */
export const GET = withRoute(async () => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const today = new Date(`${todayISO()}T00:00:00.000Z`);

  const centres = await prisma.centre.findMany({
    where: { ...centreScope(who.viewer), status: "OPEN" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      size: true,
      inspections: {
        where: { status: "SUBMITTED" },
        orderBy: { date: "desc" },
        take: 1,
        select: { id: true, date: true, scorePct: true, verdict: true },
      },
      visits: {
        where: { date: { gte: today }, status: "PLANNED" },
        orderBy: { date: "asc" },
        take: 1,
        select: { id: true, date: true, inspector: { select: { name: true } } },
      },
    },
  });

  const rows = coverage(
    centres.map((c) => ({
      centreId: c.id,
      centre: c.name,
      lastInspected: c.inspections[0]?.date ?? null,
      nextPlanned: c.visits[0]?.date ?? null,
    })),
    today
  );

  // Re-attach the detail the rules layer has no business knowing about.
  const byId = new Map(centres.map((c) => [c.id, c]));
  return NextResponse.json({
    overdueDays: OVERDUE_DAYS,
    centres: rows.map((r) => {
      const c = byId.get(r.centreId)!;
      return {
        ...r,
        size: c.size,
        last: c.inspections[0] ?? null,
        next: c.visits[0] ?? null,
      };
    }),
  });
});
