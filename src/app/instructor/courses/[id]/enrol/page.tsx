import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { BulkEnrol } from "@/components/bulk-enrol";
import { PageHeader } from "@/components/page-ui";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { audienceFilter } from "@/lib/auto-enrol";
import { ownsCourse } from "@/lib/course-access";

export default async function BulkEnrolPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      roleAssignments: { include: { role: { select: { type: true } } } },
      enrollments: { select: { userId: true } },
    },
  });
  if (!course) notFound();
  // Same rule as the route: the author or a super admin. Any instructor could
  // open this for any course and read its whole audience's names and emails.
  if (!ownsCourse(session.user, course.authorId)) redirect("/instructor/courses");

  const enrolledIds = new Set(course.enrollments.map((e) => e.userId));

  // Candidates: exactly the people the course is assigned to (the same match
  // auto-enrolment uses). A course assigned to nobody has no candidates — it
  // used to offer every trainee, and an enrolment outside the assignment no
  // longer opens the course anyway (learner-access.ts).
  const audience = audienceFilter(course.roleAssignments);
  const trainees = audience
    ? await prisma.user.findMany({
        where: { active: true, ...audience },
        select: {
          id: true, name: true, email: true, position: true, subPosition: true, subPositions: true,
          centre: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const candidates = trainees.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    centre: t.centre?.name ?? "—",
    position: effectiveSubPositions(t).join(", ") || t.position,
    alreadyEnrolled: enrolledIds.has(t.id),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        backHref={`/instructor/courses/${course.id}/curriculum`}
        backLabel={course.title}
        title="Bulk enrol"
        subtitle="Candidates match the role and position assigned to this course — auto-enrolment already covers most of them."
      />
      <BulkEnrol courseId={course.id} candidates={candidates} />
    </div>
  );
}
