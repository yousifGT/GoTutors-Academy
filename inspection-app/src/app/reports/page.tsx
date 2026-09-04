import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canViewAllCentres, centreScope, inspectionScope, isCentreScoped, readsWholeCentre } from "@/lib/access";
import { Wordmark } from "@/components/brand";
import { ReportBrowser } from "./report-browser";

export default async function ReportsPage() {
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  const [centres, months, unread] = await Promise.all([
    // The centres worth offering as a filter: the ones this viewer can actually
    // see inspections for.
    prisma.centre.findMany({
      where: centreScope(viewer),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, managers: { select: { id: true } } },
    }),
    // Months that actually contain something, so the filter never offers an
    // empty one.
    prisma.inspection.findMany({
      where: inspectionScope(viewer),
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.reportDelivery.count({ where: { userId: user.id, readAt: null } }),
  ]);

  const monthKeys = Array.from(
    new Set(months.map((m) => m.date.toISOString().slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <div className="flex gap-4 text-sm">
          {canViewAllCentres(user.role) && (
            <Link href="/centres" className="text-sky-600">
              Centres
            </Link>
          )}
          <Link href="/" className="text-sky-600">
            ← Home
          </Link>
        </div>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-navy">Inspections</h1>
      <p className="mt-1 text-sm text-slate-500">
        {canViewAllCentres(user.role)
          ? "Every centre."
          : isCentreScoped(user.role)
            ? "The centres you are responsible for."
            : "The inspections you carried out."}
      </p>

      <ReportBrowser
        centres={centres.map((c) => ({ id: c.id, name: c.name }))}
        months={monthKeys}
        unread={unread}
        dashboards={centres
          .filter((c) => readsWholeCentre(viewer, c.managers.map((m) => m.id)))
          .map((c) => c.id)}
      />
    </main>
  );
}
