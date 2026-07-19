import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Avatar } from "@/components/page-ui";

export default async function TeamCertificatesPage({ searchParams }: { searchParams: { user?: string } }) {
  const session = await requireSession();
  const certs = await prisma.certificate.findMany({
    where: {
      user: { supervisorId: session.user.id },
      ...(searchParams.user ? { userId: searchParams.user } : {}),
    },
    include: { user: true, course: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Team certificates" subtitle="Everything your team has earned." />
      {certs.length === 0 && <EmptyState icon="🎓" title="No certificates yet" hint="They appear here as your team completes courses." />}
      <div className="grid gap-3 md:grid-cols-2">
        {certs.map((c) => (
          <div key={c.id} className="gt-card p-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={c.user.name} size="sm" />
              <div className="min-w-0">
                <div className="truncate font-medium">{c.course.title}</div>
                <div className="text-xs text-[var(--muted)]">{c.user.name} · Serial {c.serial} · {formatDate(c.issuedAt)}</div>
              </div>
            </div>
            <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost text-xs shrink-0">Download</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
