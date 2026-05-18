import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";

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
      <h2 className="text-lg font-bold">Team certificates</h2>
      {certs.length === 0 && <div className="gt-card p-6 text-[var(--muted)]">No certificates yet.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {certs.map((c) => (
          <div key={c.id} className="gt-card p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{c.course.title}</div>
              <div className="text-xs text-[var(--muted)]">{c.user.name} · Serial {c.serial} · {formatDate(c.issuedAt)}</div>
            </div>
            <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-ghost text-sm">Download</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
