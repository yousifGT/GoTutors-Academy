import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { centreScope, readsWholeCentre } from "@/lib/access";
import { Wordmark } from "@/components/brand";
import { CentreIndex } from "./centre-index";

/**
 * Every centre this viewer reads in full, to look one up and open its progress.
 *
 * The per-centre page existed with no way in for someone responsible for all of
 * them: a head of centre reaches theirs from their home screen, but head office
 * and the super admin had to find an inspection at the centre first and follow
 * the link out of its report. Looking up a centre by name is the thing they
 * actually want to do.
 */
export default async function CentresPage() {
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  const centres = await prisma.centre.findMany({
    where: centreScope(viewer),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      size: true,
      status: true,
      managers: { select: { id: true, name: true } },
      // Submitted only, so the count cannot contradict the line beside it: a
      // centre with one draft open and nothing finished was reading as
      // "1 inspection · never inspected".
      _count: { select: { inspections: { where: { status: "SUBMITTED" } } } },
      inspections: {
        where: { status: "SUBMITTED" },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 2,
        select: { id: true, date: true, scorePct: true, verdict: true },
      },
    },
  });

  const mine = centres.filter((c) => readsWholeCentre(viewer, c.managers.map((m) => m.id)));
  // Nobody who cannot read a whole centre has anything to look up here.
  if (mine.length === 0) redirect("/reports");

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <Link href="/reports" className="text-sm text-sky-600">
          All inspections →
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-navy">Centres</h1>
      <p className="mt-1 text-sm text-slate-500">
        How each one is doing. Open a centre for what has been put right since its last visit, what has not, and the
        score at every visit.
      </p>

      <CentreIndex
        centres={mine.map((c) => {
          const [latest, previous] = c.inspections;
          return {
            id: c.id,
            name: c.name,
            address: c.address,
            size: c.size,
            status: c.status,
            inspections: c._count.inspections,
            latest: latest
              ? {
                  date: latest.date.toISOString(),
                  scorePct: latest.scorePct,
                  verdict: latest.verdict,
                  // The move since the visit before it, which is the number
                  // worth seeing beside a score in a list of centres.
                  change:
                    previous && latest.scorePct != null && previous.scorePct != null
                      ? latest.scorePct - previous.scorePct
                      : null,
                }
              : null,
            heads: c.managers.map((m) => m.name),
          };
        })}
      />
    </main>
  );
}
