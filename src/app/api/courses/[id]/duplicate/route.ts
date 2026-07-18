import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { ownsCourse } from "@/lib/course-access";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const src = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: {
              video: true,
              quiz: { include: { questions: { include: { answers: true }, orderBy: { order: "asc" } } } },
            },
          },
        },
      },
      roleAssignments: true,
    },
  });
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A non-super-admin may only duplicate a course they authored — otherwise an
  // instructor could clone any course (including its answer keys).
  if (!ownsCourse(session.user, src.authorId))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const copy = await prisma.course.create({
    data: {
      title: `${src.title} (copy)`,
      description: src.description,
      category: src.category,
      thumbnail: src.thumbnail,
      authorId: session.user.id,
      passThreshold: src.passThreshold,
      published: false,
      roleAssignments: {
        create: src.roleAssignments.map((ra) => ({ roleId: ra.roleId, subPosition: ra.subPosition })),
      },
      modules: {
        create: src.modules.map((m) => ({
          title: m.title,
          order: m.order,
          lessons: {
            create: m.lessons.map((l) => ({
              title: l.title,
              content: l.content,
              order: l.order,
              video: l.video ? { create: { provider: l.video.provider, url: l.video.url, duration: l.video.duration } } : undefined,
              quiz: l.quiz
                ? {
                    create: {
                      passThreshold: l.quiz.passThreshold,
                      retryLimit: l.quiz.retryLimit,
                      questions: {
                        create: l.quiz.questions.map((q) => ({
                          type: q.type,
                          prompt: q.prompt,
                          order: q.order,
                          points: q.points,
                          answers: { create: q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })) },
                        })),
                      },
                    },
                  }
                : undefined,
            })),
          },
        })),
      },
    },
  });

  return NextResponse.json({ id: copy.id });
}
