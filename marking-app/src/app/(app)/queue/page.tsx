import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { statusView, WAITING_ON_HUMAN } from "@/lib/marking/view";
import { PageHeader, Empty } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Everything waiting on a person.
 *
 * This is the page that makes the human fallback real rather than a promise: a
 * paper the reader could not handle is not lost in a list of successes, it is
 * here, with the reason it landed here written next to it.
 */
export default async function QueuePage() {
  const viewer = await requireViewer();

  const [waiting, recentlyChecked] = await Promise.all([
    prisma.submission.findMany({
      where: { ...submissionScope(viewer), status: { in: WAITING_ON_HUMAN } },
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { name: true, yearGroup: true } },
        markScheme: { select: { title: true, subject: true } },
        uploadedBy: { select: { name: true } },
        _count: { select: { marks: true } },
      },
    }),
    prisma.submission.findMany({
      where: { ...submissionScope(viewer), status: "REVIEWED" },
      orderBy: { reviewedAt: "desc" },
      take: 5,
      include: {
        student: { select: { name: true } },
        markScheme: { select: { title: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Needs marking"
        subtitle="Papers the reader could not finish on its own. Marking one here also teaches it."
        backHref="/"
        backLabel="Dashboard"
      />

      {waiting.length === 0 ? (
        <Empty title="Nothing waiting">
          Every paper has been marked. Anything the reader is unsure about will appear here.
        </Empty>
      ) : (
        <div className="space-y-3">
          {waiting.map((s) => {
            const view = statusView(s.status);
            return (
              <Link key={s.id} href={`/papers/${s.id}`} className="card block transition hover:border-sky/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">
                      {s.student.name}
                      {s.student.yearGroup && (
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">{s.student.yearGroup}</span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      {s.markScheme.title} · {s.markScheme.subject} · uploaded {timeAgo(s.createdAt)} by{" "}
                      {s.uploadedBy.name}
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${view.tone}`}>{view.label}</span>
                </div>
                {s.failureReason && (
                  <div className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-2 text-sm text-[var(--muted)]">
                    {s.failureReason}
                  </div>
                )}
                {s._count.marks === 0 && (
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    Nothing was marked automatically — this one is from scratch.
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {recentlyChecked.length > 0 && (
        <div className="card p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-bold">Recently checked by a person</div>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {recentlyChecked.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <Link href={`/papers/${s.id}`} className="text-sky hover:underline">
                  {s.student.name} — {s.markScheme.title}
                </Link>
                <span className="text-xs text-[var(--muted)]">
                  {s.reviewedBy?.name} · {s.reviewedAt ? timeAgo(s.reviewedAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
