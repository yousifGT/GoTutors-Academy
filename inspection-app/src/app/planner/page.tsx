import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canConduct, centreScope } from "@/lib/access";
import { OVERDUE_DAYS, attendance, canScheduleVisits, coverage, needsResolving, todayISO } from "@/lib/schedule";
import { Wordmark } from "@/components/brand";
import { Planner } from "./planner";

export default async function PlannerPage() {
  const user = await requireUser();
  if (!canScheduleVisits(user.role)) redirect("/");
  const viewer = { id: user.id, role: user.role };
  const today = new Date(`${todayISO()}T00:00:00.000Z`);

  const [centres, people, visits] = await Promise.all([
    prisma.centre.findMany({
      where: { ...centreScope(viewer), status: "OPEN" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        size: true,
        inspections: {
          where: { status: "SUBMITTED" },
          orderBy: { date: "desc" },
          take: 1,
          select: { date: true, scorePct: true, verdict: true },
        },
        visits: {
          where: { date: { gte: today }, status: "PLANNED" },
          orderBy: { date: "asc" },
          take: 1,
          select: { date: true, inspector: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    // Ninety days back as well as forward: settling a missed visit and judging
    // attendance both need history, not just the diary ahead.
    prisma.scheduledVisit.findMany({
      where: {
        centre: centreScope(viewer),
        date: { gte: new Date(today.getTime() - 90 * 86_400_000) },
      },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        date: true,
        note: true,
        status: true,
        inspectionId: true,
        statusReason: true,
        statusSetBy: { select: { name: true } },
        centre: { select: { id: true, name: true } },
        inspector: { select: { id: true, name: true } },
      },
    }),
  ]);

  const rows = coverage(
    centres.map((c) => ({
      centreId: c.id,
      centre: c.name,
      lastInspected: c.inspections[0]?.date ?? null,
      nextPlanned: c.visits[0]?.date ?? null,
    })),
    today
  );
  const byId = new Map(centres.map((c) => [c.id, c]));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <Link href="/" className="text-sm text-sky-600">
          ← Home
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-navy">Planner</h1>
      <p className="mt-1 text-sm text-slate-500">
        Which centres need a visit, and who is going. A centre is flagged after {OVERDUE_DAYS} days without an
        inspection — unless one is already booked.
      </p>

      <Planner
        coverage={rows.map((r) => ({
          ...r,
          lastInspected: r.lastInspected ? r.lastInspected.toISOString() : null,
          nextPlanned: r.nextPlanned ? r.nextPlanned.toISOString() : null,
          last: byId.get(r.centreId)!.inspections[0]
            ? {
                date: byId.get(r.centreId)!.inspections[0].date.toISOString(),
                scorePct: byId.get(r.centreId)!.inspections[0].scorePct,
                verdict: byId.get(r.centreId)!.inspections[0].verdict,
              }
            : null,
          nextInspector: byId.get(r.centreId)!.visits[0]?.inspector.name ?? null,
        }))}
        inspectors={people.filter((p) => canConduct(p.role)).map(({ id, name }) => ({ id, name }))}
        visits={visits.map((v) => ({
          ...v,
          date: v.date.toISOString(),
          needsResolving: needsResolving(
            { status: v.status, hasInspection: v.inspectionId !== null, date: v.date },
            today
          ),
        }))}
        attendance={attendance(
          visits.map((v) => ({
            inspectorId: v.inspector.id,
            inspector: v.inspector.name,
            status: v.status,
            hasInspection: v.inspectionId !== null,
            date: v.date,
          })),
          today
        )}
        today={todayISO()}
      />
    </main>
  );
}
