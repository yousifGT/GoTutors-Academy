import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  canConduct,
  canManageCentres,
  canManageUsers,
  canViewAllCentres,
  centreScope,
  inspectionScope,
  isCentreScoped,
} from "@/lib/access";
import { fmtDuration } from "@/lib/core";
import { asDate, canScheduleVisits, todayISO } from "@/lib/schedule";
import { ROLE_LABEL, shortDate } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";
import { VisitList } from "@/components/visit-list";
import { canReadAudit } from "@/lib/audit-view";
import { SignOut } from "@/components/sign-out";
import { DraftCard } from "@/components/draft-card";

export default async function Home() {
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  const today = todayISO();
  const [centres, inspections, template, unread, assigned, visits, responsible] = await Promise.all([
    prisma.centre.count({ where: { ...centreScope(viewer), status: "OPEN" } }),
    prisma.inspection.findMany({
      where: inspectionScope(viewer),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        date: true,
        size: true,
        status: true,
        scorePct: true,
        verdict: true,
        activeMs: true,
        centre: { select: { name: true } },
        inspector: { select: { name: true } },
        // Only used for the drafts among them: a visit keeps the checklist it
        // started with, and saying which one is what makes an old draft
        // explicable rather than a bug.
        template: { select: { version: true } },
      },
    }),
    prisma.template.findFirst({
      where: { isActive: true },
      orderBy: { version: "desc" },
      select: { version: true, _count: { select: { sections: true } } },
    }),
    prisma.reportDelivery.count({ where: { userId: user.id, readAt: null } }),
    // Where this inspector is expected to be. It does not limit where they may
    // go — it is the list they will usually want.
    prisma.centre.findMany({
      where: { inspectors: { some: { id: user.id } }, status: "OPEN" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, inspections: { orderBy: { date: "desc" }, take: 1, select: { date: true } } },
    }),
    // Their diary: anything still open from the last fortnight, plus what is
    // coming. A missed visit stays visible rather than scrolling out of history.
    prisma.scheduledVisit.findMany({
      where: {
        inspectorId: user.id,
        status: { in: ["PLANNED", "DONE"] },
        // Server component: this runs once per request, on the server, and the
        // "now" it needs is the moment of the request. The purity rule is about
        // client renders, which can be replayed or discarded; there is no such
        // thing happening here.
        // eslint-disable-next-line react-hooks/purity
        date: { gte: asDate(new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)) },
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        note: true,
        inspectionId: true,
        centre: { select: { id: true, name: true, size: true } },
      },
    }),
    // The centres this viewer answers for. A head of centre lands here with a
    // list of new reports and no way through to how their own centre is doing
    // over time, which is the thing they actually want to know.
    isCentreScoped(viewer.role)
      ? prisma.centre.findMany({
          where: { managers: { some: { id: user.id } } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            inspections: {
              where: { status: "SUBMITTED" },
              orderBy: [{ date: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: { date: true, scorePct: true, verdict: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const drafts = inspections.filter((i) => i.status === "DRAFT");

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="flex items-center justify-between">
        <div>
          <Wordmark className="text-2xl" />
          <p className="text-sm text-slate-500">Centre inspection</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium text-slate-700">{user.name}</p>
          <p className="text-slate-500">{ROLE_LABEL[user.role] ?? user.role}</p>
          <div className="mt-1 flex justify-end gap-3 text-xs">
            {canViewAllCentres(user.role) && (
              <Link href="/centres" className="font-medium text-sky-600">
                Centres
              </Link>
            )}
            {canScheduleVisits(user.role) && (
              <Link href="/planner" className="font-medium text-sky-600">
                Planner
              </Link>
            )}
            {(canManageUsers(user.role) || canManageCentres(user.role) || canReadAudit(user.role)) && (
              <Link href={canManageUsers(user.role) ? "/admin/users" : "/admin/audit"} className="font-medium text-sky-600">
                Manage
              </Link>
            )}
            <Link href="/profile" className="font-medium text-sky-600">
              Account
            </Link>
            <SignOut />
          </div>
        </div>
      </header>

      {unread > 0 && (
        <Link
          href="/reports"
          className="mt-6 flex items-center justify-between rounded-xl bg-sky-600 px-4 py-3.5 text-white"
        >
          <span className="font-semibold">
            {unread} new inspection report{unread === 1 ? "" : "s"} for your centre
            {unread === 1 ? "" : "s"}
          </span>
          <span className="font-semibold">→</span>
        </Link>
      )}

      <section className="mt-8 grid grid-cols-3 gap-4">
        <Stat label="Centres" value={centres} />
        <Stat label="Inspections" value={inspections.length} />
        <Stat label="Checklist" value={template ? `v${template.version}` : "—"} hint={template ? `${template._count.sections} sections` : "not seeded"} />
      </section>

      {canConduct(user.role) && (
        <div className="mt-6 space-y-3">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              id={d.id}
              centreName={d.centre.name}
              date={d.date.toISOString()}
              checklistVersion={d.template.version}
              liveChecklistVersion={template?.version}
            />
          ))}
          <Link
            href="/inspections/new"
            className="block rounded-xl bg-navy px-4 py-3.5 text-center font-semibold text-white transition hover:bg-navy-700"
          >
            Start an inspection
          </Link>
        </div>
      )}

      <VisitList visits={visits} today={today} />

      {responsible.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {responsible.length === 1 ? "Your centre" : "Your centres"}
          </h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {responsible.map((c) => {
              const last = c.inspections[0];
              return (
                <li key={c.id}>
                  <Link
                    href={`/centres/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-800">{c.name}</span>
                      <span className="block text-xs text-slate-500">
                        {last ? `Last inspected ${shortDate(last.date)}` : "Never inspected"}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-sky-600">
                        See what has improved →
                      </span>
                    </span>
                    {last && (
                      <span
                        className="shrink-0 text-right font-semibold"
                        style={{ color: VERDICT_COLOR[last.verdict ?? ""] ?? "#334155" }}
                      >
                        {last.scorePct}%
                        <span className="block text-xs font-medium">{last.verdict}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {assigned.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your centres</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {assigned.map((c) => (
              <li key={c.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {c.inspections[0]
                    ? `Last inspected ${shortDate(c.inspections[0].date)}`
                    : "Never inspected"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent visits</h2>
        <Link href="/reports" className="text-sm font-medium text-sky-600">
          All inspections &amp; reports →
        </Link>
      </div>
      {inspections.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">
          {isCentreScoped(user.role)
            ? "No inspections of your centres yet. New reports appear here as soon as they are submitted."
            : "Nothing recorded yet."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {inspections.map((i) => (
            <li key={i.id}>
              <Link
                href={i.status === "DRAFT" ? `/inspections/${i.id}` : `/inspections/${i.id}/report`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"
              >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{i.centre.name}</p>
                <p className="text-sm text-slate-500">
                  {i.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  {i.inspector.name}
                  {i.activeMs > 0 && ` · ${fmtDuration(i.activeMs)}`}
                </p>
              </div>
              {i.status === "DRAFT" ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  In progress
                </span>
              ) : (
                <span
                  className="shrink-0 text-right font-semibold"
                  style={{ color: VERDICT_COLOR[i.verdict ?? ""] ?? "#334155" }}
                >
                  {i.scorePct}%
                  <span className="block text-xs font-medium">{i.verdict}</span>
                </span>
              )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 pb-8 text-xs text-slate-400">
        Runs independently of the GoTutors Academy — its own database, its own accounts.
      </p>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
