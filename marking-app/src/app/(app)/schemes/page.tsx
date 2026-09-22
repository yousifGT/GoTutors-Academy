import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { schemeScope } from "@/lib/marking/access";
import { PageHeader, Empty } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchemesPage() {
  const viewer = await requireViewer();

  const schemes = await prisma.markScheme.findMany({
    where: schemeScope(viewer),
    orderBy: [{ archived: "asc" }, { title: "asc" }],
    include: {
      owner: { select: { name: true } },
      _count: { select: { questions: true, submissions: true, examples: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mark schemes"
        subtitle="What the reader marks against. The better the guidance, the better the marking."
        backHref="/"
        backLabel="Dashboard"
        actions={
          <Link href="/schemes/new" className="btn-primary text-sm">
            New mark scheme
          </Link>
        }
      />

      {schemes.length === 0 ? (
        <Empty title="No mark schemes yet">
          <Link href="/schemes/new" className="text-sky hover:underline">
            Write your first one
          </Link>{" "}
          — a question, its expected answer, and how to award part marks.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schemes.map((s) => (
            <Link key={s.id} href={`/schemes/${s.id}`} className={`card block transition hover:border-sky/50 ${s.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">{s.title}</div>
                  <div className="text-sm text-[var(--muted)]">
                    {s.subject}
                    {s.level ? ` · ${s.level}` : ""}
                  </div>
                </div>
                {s.archived && <span className="badge bg-[var(--soft)] text-[var(--muted)]">Archived</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                <span>{s._count.questions} questions</span>
                <span>{s._count.submissions} papers marked</span>
                <span>{s._count.examples} examples learned</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                by {s.owner.name} · {formatDate(s.createdAt)}
                {s.shared ? " · shared with the centre" : " · private"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
