import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/page-ui";
import { getFieldStatus } from "@/lib/field-training";
import { subjectCertificateLabel, subjectCertificates } from "@/lib/subject-certificate";

export default async function CertificatesPage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  const [me, certs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true, roleId: true, subPosition: true, subPositions: true,
        teacherPositions: true, role: { select: { type: true } },
      },
    }),
    prisma.certificate.findMany({
      where: { userId: session.user.id },
      include: { course: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  // Subject qualifications are derived from the courses held, so a subject that
  // has gained a course shows what is outstanding rather than disappearing.
  const subjects = me ? subjectCertificates(await getFieldStatus(me)) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Certificates" subtitle="Course certificates record what you have completed; subject qualifications record what you can tutor." />

      {subjects.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Subject qualifications</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((s) => (
              <div
                key={s.field}
                className={`gt-card p-6 ${s.downloadable ? "" : "opacity-80"}`}
              >
                <div className={`text-xs uppercase tracking-widest ${s.downloadable ? "text-picton" : "text-[var(--muted)]"}`}>
                  {s.downloadable ? "Qualified to tutor" : "Not yet qualified"}
                </div>
                <div className="mt-2 text-xl font-bold">{s.field}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{subjectCertificateLabel(s)}</div>
                {s.qualifiedAt && (
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {s.status === "qualified" ? "Qualified" : "Last qualified"} {formatDate(new Date(s.qualifiedAt))}
                  </div>
                )}
                <div className="mt-4">
                  {s.downloadable ? (
                    <Link
                      href={`/api/subject-certificates?userId=${encodeURIComponent(session.user.id)}&field=${encodeURIComponent(s.field)}`}
                      target="_blank"
                      className="gt-btn-primary"
                    >
                      Download PDF
                    </Link>
                  ) : (
                    <span className="text-sm text-[var(--muted)]">Finish the remaining course to unlock this.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Course certificates</h2>
        {certs.length === 0 ? (
          <EmptyState icon="🎓" title="No course certificates yet" hint="Finish a course — every lesson watched and every quiz passed — and your certificate lands here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {certs.map((c) => (
              <div key={c.id} className="gt-card p-6">
                <div className="text-xs uppercase tracking-widest text-gold">Certificate</div>
                <div className="mt-2 text-xl font-bold">{c.course.title}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Serial {c.serial}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">Issued {formatDate(c.issuedAt)}</div>
                <div className="mt-4 flex gap-2">
                  <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-primary">Download PDF</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
