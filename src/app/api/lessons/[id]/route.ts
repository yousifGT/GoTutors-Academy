import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.update({
      where: { id: params.id },
      data: { title: body.title, content: body.content ?? null },
    });

    if (body.video === null) {
      await tx.video.deleteMany({ where: { lessonId: lesson.id } });
    } else if (body.video) {
      await tx.video.upsert({
        where: { lessonId: lesson.id },
        update: { provider: body.video.provider, url: body.video.url },
        create: { lessonId: lesson.id, provider: body.video.provider, url: body.video.url },
      });
    }

    if (body.quiz) {
      const quiz = await tx.quiz.upsert({
        where: { lessonId: lesson.id },
        update: { passThreshold: body.quiz.passThreshold ?? 70, retryLimit: body.quiz.retryLimit ?? 3 },
        create: { lessonId: lesson.id, passThreshold: body.quiz.passThreshold ?? 70, retryLimit: body.quiz.retryLimit ?? 3 },
      });
      // Replace questions
      await tx.question.deleteMany({ where: { quizId: quiz.id } });
      if (Array.isArray(body.quiz.questions)) {
        for (let i = 0; i < body.quiz.questions.length; i++) {
          const q = body.quiz.questions[i];
          await tx.question.create({
            data: {
              quizId: quiz.id,
              type: q.type,
              prompt: q.prompt,
              points: q.points ?? 1,
              order: i,
              answers: { create: (q.answers ?? []).map((a: any) => ({ text: a.text, isCorrect: !!a.isCorrect })) },
            },
          });
        }
      }
    }
    return lesson;
  });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.lesson.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
