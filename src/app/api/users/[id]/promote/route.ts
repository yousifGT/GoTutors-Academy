import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/validate";
import { promoteToTutor } from "@/lib/promotion";

const PromoteSchema = z.object({ subPosition: z.string().min(1).max(200) });

/**
 * Manual promotion of a fully-trained field to its tutor title (the shared
 * core lives in lib/promotion.ts and also runs automatically when the field's
 * final certificate lands).
 *
 * Allowed: super admins for anyone; centre admins for users in their centre.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { centreId: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const viewer = session.user;
  const allowed =
    viewer.roleType === "SUPER_ADMIN" ||
    (viewer.roleType === "CENTRE_ADMIN" && viewer.centreId != null && target.centreId === viewer.centreId);
  if (!allowed) return NextResponse.json({ error: "You can't promote this user" }, { status: 403 });

  const parsed = await parseJson(req, PromoteSchema);
  if (!parsed.ok) return parsed.response;

  const result = await promoteToTutor(params.id, parsed.data.subPosition, { actorId: viewer.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, user: result.user });
}
