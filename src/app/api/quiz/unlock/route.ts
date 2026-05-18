import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.QUIZ_UNLOCK_RETRY)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { userId, quizId } = await req.json();
  if (!userId || !quizId) return NextResponse.json({ error: "missing" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.user.roleType === "CENTRE_ADMIN" && session.user.centreId !== target.centreId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Wipe attempts so they get a fresh 3 tries
  await prisma.quizAttempt.deleteMany({ where: { userId, quizId } });

  return NextResponse.json({ ok: true });
}
