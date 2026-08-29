import Link from "next/link";
import { SIZE_SHORT, shortDate } from "@/lib/format";

export interface VisitRow {
  id: string;
  date: Date;
  note: string | null;
  inspectionId: string | null;
  centre: { id: string; name: string; size: "SMALL" | "MEDIUM" | "LARGE" | null };
}

/**
 * An inspector's day.
 *
 * Today's visits lead with a Start button, because that is the one thing they
 * came to the app to do. A day that has passed with no inspection is shown as
 * missed rather than quietly dropped — a visit nobody made is exactly the thing
 * worth knowing about.
 */
export function VisitList({ visits, today }: { visits: VisitRow[]; today: string }) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todays = visits.filter((v) => iso(v.date) === today);
  const upcoming = visits.filter((v) => iso(v.date) > today);
  const missed = visits.filter((v) => iso(v.date) < today && !v.inspectionId);

  if (!todays.length && !upcoming.length && !missed.length) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your visits</h2>

      {missed.length > 0 && (
        <ul className="mt-2 space-y-2">
          {missed.map((v) => (
            <li key={v.id} className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="font-medium text-red-900">
                {v.centre.name} <span className="font-normal">— missed on {shortDate(v.date)}</span>
              </p>
              {v.note && <p className="text-sm text-red-800">{v.note}</p>}
              <Link href="/inspections/new" className="mt-1 inline-block text-sm font-medium text-red-800 underline">
                Inspect it now
              </Link>
            </li>
          ))}
        </ul>
      )}

      {todays.map((v) => (
        <div key={v.id} className="mt-2 rounded-xl bg-navy p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">Today</p>
          <p className="text-lg font-bold">{v.centre.name}</p>
          {v.centre.size && <p className="text-sm text-sky-100">{SIZE_SHORT[v.centre.size]} centre</p>}
          {v.note && <p className="mt-1 text-sm text-sky-100">{v.note}</p>}
          {v.inspectionId ? (
            <Link
              href={`/inspections/${v.inspectionId}`}
              className="mt-3 inline-block rounded-lg bg-white px-4 py-2 font-semibold text-navy"
            >
              Continue inspection
            </Link>
          ) : (
            <Link
              href={`/inspections/new?centre=${v.centre.id}`}
              className="mt-3 inline-block rounded-lg bg-white px-4 py-2 font-semibold text-navy"
            >
              Start inspection
            </Link>
          )}
        </div>
      ))}

      {upcoming.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {upcoming.slice(0, 5).map((v) => (
            <li key={v.id} className="p-4">
              <p className="font-medium text-slate-800">{v.centre.name}</p>
              <p className="text-sm text-slate-500">
                {shortDate(v.date)}
                {v.note && ` · ${v.note}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
