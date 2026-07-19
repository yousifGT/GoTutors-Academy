import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const SortSchema = z.object({ courseIds: z.array(zId).min(1).max(500) });

/**
 * Persist the manual ("custom") order of courses: each id gets sortOrder =
 * its index. Non-super-admins can only reorder courses they authored —
 * others in the list are silently skipped (updateMany matches nothing).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, SortSchema);
  if (!parsed.ok) return parsed.response;

  const ownerScope = session.user.roleType === "SUPER_ADMIN" ? {} : { authorId: session.user.id };
  await prisma.$transaction(
    parsed.data.courseIds.map((id, i) =>
      prisma.course.updateMany({ where: { id, ...ownerScope }, data: { sortOrder: i } })
    )
  );
  return NextResponse.json({ ok: true });
}
