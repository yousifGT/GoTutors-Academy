import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LEARNER_ROLES, requireRole } from "@/lib/session";
import { getCourseProgressForUser } from "@/lib/course-progress";
import { getMissingPrerequisites } from "@/lib/course-prereqs";
import { syncUserEnrollments } from "@/lib/auto-enrol";
import { formatDate } from "@/lib/utils";
import { ProgressBar } from "@/components/progress-bar";
import { PageHeader, EmptyState } from "@/components/page-ui";

export default async function MyCoursesPage() {
  const session = await requireRole(...LEARNER_ROLES);
  // Pick up anything assigned since they last looked. The trainee dashboard
  // already does this, but admins arrive here directly and never see it.
  await syncUserEnrollments(session.user.id);

  // Trainees and instructors have a Certificates page in their sidebar. Admins
  // don't, so their certificates live here, under the courses that earned them.
  const showCertificates = session.user.roleType === "CENTRE_ADMIN" || session.user.roleType === "SUPER_ADMIN";

  const [enrollments, certs] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: session.user.id },
      include: { course: true },
      orderBy: { enrolledAt: "desc" },
    }),
    showCertificates
      ? prisma.certificate.findMany({
          where: { userId: session.user.id },
          include: { course: { select: { title: true } } },
          orderBy: { issuedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const withProgress = await Promise.all(
    enrollments.map(async (e) => ({
      e,
      progress: await getCourseProgressForUser(session.user.id, e.courseId),
      missingPrereqs: await getMissingPrerequisites(session.user.id, e.courseId),
    }))
  );

  return (
    <div className="space-y-5">
      <PageHeader title="My courses" subtitle="Courses assigned to you. Your own learning — it doesn't appear in your reports." />
      {withProgress.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No courses yet"
          hint="Courses assigned to your role appear here automatically."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {withProgress.map(({ e, progress, missingPrereqs }) => (
            <Link key={e.id} href={`/trainee/courses/${e.courseId}`} className={`gt-card p-5 hover:shadow-soft transition ${missingPrereqs.length > 0 ? "opacity-75" : ""}`}>
              {missingPrereqs.length > 0 ? (
                <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">🔒 Locked</span>
              ) : e.completed ? (
                <span className="gt-badge bg-mint/15 text-mint">🎓 Completed</span>
              ) : (
                <span className="gt-badge bg-picton/15 text-picton">{progress?.percent ?? 0}% complete</span>
              )}
              <div className="mt-1 text-lg font-bold">{e.course.title}</div>
              <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{e.course.description}</p>
              {missingPrereqs.length > 0 ? (
                <div className="mt-4 text-xs text-[var(--muted)]">
                  Complete <span className="text-[var(--fg)]">{missingPrereqs.map((m) => m.title).join(", ")}</span> first
                </div>
              ) : (
                <div className="mt-4"><ProgressBar percent={progress?.percent ?? 0} /></div>
              )}
            </Link>
          ))}
        </div>
      )}

      {showCertificates && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Your certificates</h2>
          {certs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Finish a course — every lesson watched and every quiz passed — and its certificate appears here.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {certs.map((c) => (
                <div key={c.id} className="gt-card p-6">
                  <div className="text-xs uppercase tracking-widest text-gold">Certificate</div>
                  <div className="mt-2 text-xl font-bold">{c.course.title}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">Serial {c.serial}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">Issued {formatDate(c.issuedAt)}</div>
                  <div className="mt-4">
                    <Link href={`/api/certificates/${c.id}/download`} target="_blank" className="gt-btn-primary">Download PDF</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
