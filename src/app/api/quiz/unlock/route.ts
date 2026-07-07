import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { canManageUser } from "@/lib/scope";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const UnlockSchema = z.object({ userId: zId, quizId: zId });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.QUIZ_UNLOCK_RETRY)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, UnlockSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, quizId } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { type: true } } },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canManageUser(session.user, { roleType: target.role.type, centreId: target.centreId }))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Wipe attempts so they get a fresh 3 tries
  await prisma.quizAttempt.deleteMany({ where: { userId, quizId } });

  return NextResponse.json({ ok: true });
}
