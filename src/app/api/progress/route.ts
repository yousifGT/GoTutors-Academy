import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { isLessonUnlocked } from "@/lib/course-progress";
import { computeWatchState } from "@/lib/watch-progress";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const ProgressSchema = z.object({
  lessonId: zId,
  // Furthest playback position reached, and the video's length (both from the
  // player). The server bounds the position by real elapsed time, so neither can
  // be used to fake completion — see computeWatchState.
  watchedSeconds: z.number().int().min(0).max(86400).optional(),
  duration: z.number().int().min(0).max(86400).optional(),
  // Only honored for providers we can't measure (e.g. Loom).
  videoWatched: z.boolean().optional(),
});

export const POST = withRoute(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, ProgressSchema);
  if (!parsed.ok) return parsed.response;
  const { lessonId, watchedSeconds, duration, videoWatched } = parsed.data;

  // Integrity: only record progress for a lesson in a course the user is
  // actually enrolled in. Otherwise a trainee could POST videoWatched=true for
  // any lessonId and bypass the "watch the video first" quiz gate, or forge
  // completion for courses they were never assigned.
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } }, video: { select: { provider: true } } },
  });
  if (!lesson) return NextResponse.json({ error: "lesson not found" }, { status: 404 });
  // Super admins may preview any course (mirrors the lesson page), so their
  // preview progress is recorded like a trainee's; everyone else must be enrolled.
  if (session.user.roleType !== "SUPER_ADMIN") {
    const enrolled = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: session.user.id, courseId: lesson.module.courseId } },
      select: { userId: true },
    });
    if (!enrolled) return NextResponse.json({ error: "not enrolled" }, { status: 403 });
  }
  // Can't record progress for a lesson whose predecessors aren't done — stops
  // out-of-order completion via direct API calls.
  if (!(await isLessonUnlocked(session.user.id, lessonId)))
    return NextResponse.json({ error: "Previous lessons must be completed first." }, { status: 403 });

  // Ensure a progress row exists; its createdAt anchors the elapsed-time cap.
  // Write the anchor from THIS process's clock (not the DB's @default(now())) so
  // the elapsed calc below compares two readings of the same clock — otherwise a
  // DB/app clock skew (common with Dockerised Postgres) can make elapsed tiny or
  // negative and permanently lock a fully-watched video.
  const existing = await prisma.progress.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    update: {},
    create: { userId: session.user.id, lessonId, createdAt: new Date() },
  });

  const now = Date.now();
  let anchorMs = existing.createdAt.getTime();
  // Self-heal a bad anchor: a value in the future (or unparseable) can only come
  // from a different/skewed clock. Re-anchor to now so a genuine watcher isn't
  // locked out — they just resume the watch-time count from this moment.
  const reanchor = !(anchorMs <= now);
  if (reanchor) anchorMs = now;
  const elapsedRealSeconds = (now - anchorMs) / 1000;

  const state = computeWatchState({
    previousTimeSpent: existing.timeSpent,
    reportedWatchedSeconds: watchedSeconds ?? 0,
    elapsedRealSeconds,
    durationSeconds: duration ?? 0,
    clientClaimsWatched: videoWatched ?? false,
    // Manual "I watched it" is only trusted for providers we can't measure (Loom).
    manualAllowed: lesson.video?.provider === "LOOM",
    alreadyWatched: existing.videoWatched,
  });

  // TEMP debug (remove once the watch gate is confirmed): shows the server's
  // decision inputs/outputs in the `npm run dev` terminal.
  console.log("[watch-debug]", {
    provider: lesson.video?.provider,
    watchedSeconds: watchedSeconds ?? 0,
    duration: duration ?? 0,
    elapsedRealSeconds: Math.round(elapsedRealSeconds),
    prevTimeSpent: existing.timeSpent,
    timeSpent: state.timeSpent,
    videoWatched: state.videoWatched,
    reanchor,
  });

  const updated = await prisma.progress.update({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    data: {
      timeSpent: state.timeSpent,
      videoWatched: state.videoWatched,
      ...(reanchor ? { createdAt: new Date(now) } : {}),
    },
  });
  return NextResponse.json(updated);
});
