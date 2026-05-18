import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { lessonId, videoWatched, timeSpent } = await req.json();
  if (!lessonId) return NextResponse.json({ error: "lessonId required" }, { status: 400 });

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
