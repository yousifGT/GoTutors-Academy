import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/page-ui";

export default async function CertificatesPage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  const certs = await prisma.certificate.findMany({
    where: { userId: session.user.id },
    include: { course: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Certificates" subtitle="Earned by completing every lesson and quiz in a course." />
      {certs.length === 0 && (
        <EmptyState icon="🎓" title="No certificates yet" hint="Finish a course — every lesson watched and every quiz passed — and your certificate lands here." />
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {certs.map((c) => (
        <div key={c.id} className="gt-card p-6">
          <div className="text-xs uppercase tracking-widest text-picton">Certificate</div>
          <div className="mt-2 text-xl font-bold">{c.course.title}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Serial {c.serial}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Issued {formatDate(c.issuedAt)}</div>
          <div className="mt-4 flex gap-2">
            <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-primary">Download PDF</Link>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
