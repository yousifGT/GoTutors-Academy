import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  canConduct,
  canManageCentres,
  canManageUsers,
  centreScope,
  inspectionScope,
  isCentreScoped,
} from "@/lib/access";
import { fmtDuration } from "@/lib/core";
import { ROLE_LABEL, shortDate } from "@/lib/format";
import { VERDICT_COLOR, Wordmark } from "@/components/brand";
import { SignOut } from "@/components/sign-out";

export default async function Home() {
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  const [centres, inspections, template, unread, assigned] = await Promise.all([
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
            {(canManageUsers(user.role) || canManageCentres(user.role)) && (
              <Link href="/admin/users" className="font-medium text-sky-600">
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
            <Link
              key={d.id}
              href={`/inspections/${d.id}`}
              className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200"
            >
              <span className="text-sm font-medium text-amber-900">
                Resume {d.centre.name} — started {shortDate(d.date)}
              </span>
              <span className="text-sm font-semibold text-amber-900">→</span>
            </Link>
          ))}
          <Link
            href="/inspections/new"
            className="block rounded-xl bg-navy px-4 py-3.5 text-center font-semibold text-white transition hover:bg-navy-700"
          >
            Start an inspection
          </Link>
        </div>
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
