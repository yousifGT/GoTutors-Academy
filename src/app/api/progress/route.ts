import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { isLessonUnlocked } from "@/lib/course-progress";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const ProgressSchema = z.object({
  lessonId: zId,
  videoWatched: z.boolean().optional(),
  // Capped per request: the client heartbeats ~60s at a time, so a single call
  // can't inflate accumulated watch time (which feeds instructor reporting).
  timeSpent: z.number().int().min(0).max(120).optional(),
});

export const POST = withRoute(async (req: Request) => {
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
  // Can't record progress for a lesson whose predecessors aren't done — stops
  // out-of-order completion via direct API calls.
  if (!(await isLessonUnlocked(session.user.id, lessonId)))
    return NextResponse.json({ error: "Previous lessons must be completed first." }, { status: 403 });

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
});
