import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const ProgressSchema = z.object({
  lessonId: zId,
  videoWatched: z.boolean().optional(),
  timeSpent: z.number().int().min(0).max(86400).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, ProgressSchema);
  if (!parsed.ok) return parsed.response;
  const { lessonId, videoWatched, timeSpent } = parsed.data;

  // Integrity: only record progress for a lesson in a course the user is
  // actually enrolled in. Otherwise a trainee could POST videoWatched=true for
  // any lessonId and bypass the "watch the video first" quiz gate, or forge
  // completion for courses they were never assigned.
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson) return NextResponse.json({ error: "lesson not found" }, { status: 404 });
  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: lesson.module.courseId } },
    select: { userId: true },
  });
  if (!enrolled) return NextResponse.json({ error: "not enrolled" }, { status: 403 });

  const updated = await prisma.progress.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    update: {
      videoWatched: videoWatched ?? undefined,
      timeSpent: typeof timeSpent === "number" ? { increment: timeSpent } : undefined,
    },
    create: {
      userId: session.user.id,
      lessonId,
      videoWatched: !!videoWatched,
      timeSpent: typeof timeSpent === "number" ? timeSpent : 0,
    },
  });
  return NextResponse.json(updated);
}
