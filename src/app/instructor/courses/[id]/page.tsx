import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CourseForm } from "@/components/course-form";
import { ModuleEditor } from "@/components/module-editor";
import { DuplicateCourseButton } from "@/components/duplicate-course-button";

export default async function CourseEditorPage({ params }: { params: { id: string } }) {
  const session = await requireRole("INSTRUCTOR", "SUPER_ADMIN");
  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, include: { video: true, quiz: { include: { questions: { include: { answers: true } } } } } } } },
      roleAssignments: true,
    },
  });
  if (!course) notFound();
  if (session.user.roleType !== "SUPER_ADMIN" && course.authorId !== session.user.id) notFound();

  const [roles, allSubPositions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.subPosition.findMany({ orderBy: { name: "asc" } }),
  ]);
  const subPositions = Array.from(new Set(course.roleAssignments.map((r) => r.subPosition).filter(Boolean))) as string[];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/instructor/courses" className="text-sm text-picton">← All courses</Link>
          <h2 className="text-2xl font-bold mt-1">{course.title}</h2>
        </div>
        <div className="flex gap-2">
          <DuplicateCourseButton courseId={course.id} />
          <Link href={`/instructor/courses/${course.id}/enrol`} className="gt-btn-ghost">Bulk enrol</Link>
          <Link href={`/instructor/courses/${course.id}/progress`} className="gt-btn-ghost">Trainee progress</Link>
        </div>
      </div>

      <section>
        <h3 className="text-sm uppercase tracking-wide text-[var(--muted)] mb-2">Course details</h3>
        <CourseForm
          roles={roles.map((r) => ({ id: r.id, name: r.name, type: r.type }))}
          allSubPositions={allSubPositions.map((s) => ({ id: s.id, name: s.name, roleId: s.roleId }))}
          initial={{
            id: course.id,
            title: course.title,
            description: course.description,
            passThreshold: course.passThreshold,
            published: course.published,
            roleIds: Array.from(new Set(course.roleAssignments.map((r) => r.roleId))),
            subPositions,
          }}
        />
      </section>

      <section>
        <h3 className="text-sm uppercase tracking-wide text-[var(--muted)] mb-2">Curriculum</h3>
        <ModuleEditor courseId={course.id} modules={course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          order: m.order,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            order: l.order,
            video: l.video ? { provider: l.video.provider, url: l.video.url } : null,
            quiz: l.quiz ? { id: l.quiz.id, passThreshold: l.quiz.passThreshold, retryLimit: l.quiz.retryLimit, questionsCount: l.quiz.questions.length } : null,
          })),
        }))} />
      </section>
    </div>
  );
}
