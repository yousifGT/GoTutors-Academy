import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function CertificatesPage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN");
  const certs = await prisma.certificate.findMany({
    where: { userId: session.user.id },
    include: { course: true },
    orderBy: { issuedAt: "desc" },
  });

  if (certs.length === 0) {
    return <div className="gt-card p-6 text-[var(--muted)]">You haven't earned any certificates yet.</div>;
  }

  return (
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
  );
}
