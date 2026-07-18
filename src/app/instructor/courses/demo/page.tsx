import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

/**
 * DEMO PREVIEW of the redesigned Courses section: cleaner cards (status chip +
 * compact audience line instead of a badge pile) and a step-by-step "New
 * course" wizard. Works against real data — courses made here are real drafts.
 * Once approved, this replaces /instructor/courses and the demo route goes.
 */

/** "Trainee — Maths Tutor, English Tutor +2 more" instead of one badge per assignment. */
function compactAssignments(assignments: { role: { name: string }; subPosition: string | null }[]): string[] {
  const byRole = new Map<string, string[] | null>(); // null = the whole role
  for (const a of assignments) {
    const current = byRole.get(a.role.name);
    if (a.subPosition === null || current === null) {
      byRole.set(a.role.name, null);
      continue;
    }
    byRole.set(a.role.name, [...(current ?? []), a.subPosition]);
  }
  return [...byRole.entries()].map(([role, subs]) => {
    if (subs === null) return `${role} — everyone`;
    const shown = subs.slice(0, 3).join(", ");
    return subs.length > 3 ? `${role} — ${shown} +${subs.length - 3} more` : `${role} — ${shown}`;
  });
}

export default async function DemoCoursesPage() {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const courses = await prisma.course.findMany({
    where: session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id },
    include: { _count: { select: { modules: true, enrollments: true } }, roleAssignments: { include: { role: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold">
        Demo preview of the redesigned Courses section — everything works on real data. The current section is untouched at “Courses”.
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Courses</h2>
        <Link href="/instructor/courses/demo/new" className="gt-btn-primary">New course</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => (
          <Link key={c.id} href={`/instructor/courses/${c.id}`} className="gt-card p-5 hover:shadow-soft flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="text-lg font-bold">{c.title}</div>
              <span className={`gt-badge shrink-0 ${c.published ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                {c.published ? "Published" : "Draft"}
              </span>
            </div>
            {c.description && <p className="mt-1 text-sm text-[var(--muted)] line-clamp-1">{c.description}</p>}
            <div className="mt-3 space-y-0.5 text-sm text-[var(--muted)]">
              {c.roleAssignments.length === 0 ? (
                <div className="text-orange">No audience assigned yet</div>
              ) : (
                compactAssignments(c.roleAssignments).map((line) => (
                  <div key={line} className="truncate">For: <span className="text-[var(--fg)]">{line}</span></div>
                ))
              )}
            </div>
            <div className="mt-auto pt-3 text-xs text-[var(--muted)]">
              {c._count.modules} module{c._count.modules === 1 ? "" : "s"} · {c._count.enrollments} enrolment{c._count.enrollments === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
