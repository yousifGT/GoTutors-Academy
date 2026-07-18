import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zId } from "@/lib/validate";

const ReachSchema = z.object({
  roleIds: z.array(zId).max(50),
  subPositions: z.array(z.string().max(200)).max(100),
});

/**
 * Live audience preview for the course wizard: how many active trainees match
 * a role + sub-position selection (i.e. would be auto-enrolled on publish).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const [canCreate, canEdit] = await Promise.all([
    userHasPermission(session.user.id, PERMISSIONS.COURSE_CREATE),
    userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT),
  ]);
  if (!canCreate && !canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, ReachSchema);
  if (!parsed.ok) return parsed.response;
  const { roleIds, subPositions } = parsed.data;

  // Only trainee-type roles are auto-enrolled; other roles just get visibility.
  const traineeRoles = await prisma.role.findMany({
    where: { id: { in: roleIds }, type: "TRAINEE" },
    select: { id: true },
  });
  if (traineeRoles.length === 0) return NextResponse.json({ count: 0 });

  const count = await prisma.user.count({
    where: {
      active: true,
      OR: traineeRoles.map((r) => ({
        roleId: r.id,
        ...(subPositions.length
          ? { OR: [{ subPositions: { hasSome: subPositions } }, { subPosition: { in: subPositions } }] }
          : {}),
      })),
    },
  });
  return NextResponse.json({ count });
}
