import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { requireLessonAccess } from "@/lib/course-access";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { parseJson } from "@/lib/validate";
import { isValidVideoUrl } from "@/lib/video-url";

const AnswerSchema = z.object({ text: z.string().max(2000), isCorrect: z.boolean().optional() });
const QuestionSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "OPEN_ENDED"]),
  prompt: z.string().min(1).max(5000),
  points: z.number().int().min(0).max(1000).optional(),
  answers: z.array(AnswerSchema).optional(),
});
const VideoSchema = z
  .object({
    provider: z.enum(["UPLOAD", "YOUTUBE", "VIMEO", "LOOM"]),
    url: z.string().min(1).max(2000),
  })
  .refine((v) => isValidVideoUrl(v.provider, v.url), {
    message: "Video URL must be a valid https URL matching the selected provider",
    path: ["url"],
  });
const LessonPatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().max(50000).nullable().optional(),
  video: z.union([z.null(), VideoSchema]).optional(),
  quiz: z
    .object({
      passThreshold: z.number().int().min(1).max(100).optional(),
      retryLimit: z.number().int().min(1).max(100).optional(),
      questions: z.array(QuestionSchema).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const denied = await requireLessonAccess(session.user, params.id);
  if (denied) return denied;

  const parsed = await parseJson(req, LessonPatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    // Only touch fields the caller actually sent. `content` may be explicitly
    // set to null to clear it; omitting it leaves the existing value alone.
    const lessonData: Prisma.LessonUpdateInput = {};
    if (body.title !== undefined) lessonData.title = body.title;
    if (body.content !== undefined) lessonData.content = body.content;
    const lesson = await tx.lesson.update({ where: { id: params.id }, data: lessonData });

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
      // Update only the metadata fields that were sent — don't reset
      // passThreshold/retryLimit to defaults on a partial edit.
      const quizUpdate: Prisma.QuizUpdateInput = {};
      if (body.quiz.passThreshold !== undefined) quizUpdate.passThreshold = body.quiz.passThreshold;
      if (body.quiz.retryLimit !== undefined) quizUpdate.retryLimit = body.quiz.retryLimit;
      const quiz = await tx.quiz.upsert({
        where: { lessonId: lesson.id },
        update: quizUpdate,
        create: {
          lessonId: lesson.id,
          passThreshold: body.quiz.passThreshold ?? 70,
          retryLimit: body.quiz.retryLimit ?? 3,
        },
      });
      // Only rewrite questions when the caller actually sent a list. Omitting
      // `questions` preserves the existing ones (a metadata-only edit must not
      // wipe the quiz); sending an explicit [] clears them.
      if (body.quiz.questions !== undefined) {
        await tx.question.deleteMany({ where: { quizId: quiz.id } });
        for (let i = 0; i < body.quiz.questions.length; i++) {
          const q = body.quiz.questions[i];
          await tx.question.create({
            data: {
              quizId: quiz.id,
              type: q.type,
              prompt: q.prompt,
              points: q.points ?? 1,
              order: i,
              answers: { create: (q.answers ?? []).map((a) => ({ text: a.text, isCorrect: !!a.isCorrect })) },
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
  const denied = await requireLessonAccess(session.user, params.id);
  if (denied) return denied;
  await prisma.lesson.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
