import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/validate";
import { effectiveSubPositions } from "@/lib/sub-positions";
import { getFieldStatus } from "@/lib/field-training";
import { audit } from "@/lib/audit";

const PromoteSchema = z.object({ subPosition: z.string().min(1).max(200) });

/**
 * Promote a user to TEACHER of one field (sub-position) they are fully trained
 * in. Per-field: someone can become a Maths teacher while still an English
 * trainee. Effects:
 *  - the field moves from subPositions (training) to teacherPositions
 *  - a trainee-role account is upgraded to the instructor role on first
 *    promotion; remaining trainee fields keep auto-enrolling via subPositions
 *  - existing enrolments and certificates are untouched
 *
 * Allowed: super admins for anyone; centre admins for users in their centre.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { role: { select: { type: true } } },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const viewer = session.user;
  const allowed =
    viewer.roleType === "SUPER_ADMIN" ||
    (viewer.roleType === "CENTRE_ADMIN" && viewer.centreId != null && target.centreId === viewer.centreId);
  if (!allowed) return NextResponse.json({ error: "You can't promote this user" }, { status: 403 });

  if (target.role.type !== "TRAINEE" && target.role.type !== "INSTRUCTOR") {
    return NextResponse.json({ error: "Only trainees (or teachers still in training) can be promoted" }, { status: 400 });
  }

  const parsed = await parseJson(req, PromoteSchema);
  if (!parsed.ok) return parsed.response;
  const field = parsed.data.subPosition;

  const fields = effectiveSubPositions(target);
  if (!fields.includes(field)) {
    return NextResponse.json({ error: `${target.name} is not training as ${field}` }, { status: 400 });
  }

  const status = (await getFieldStatus(target)).find((f) => f.name === field);
  if (!status || !status.trained) {
    return NextResponse.json(
      { error: `${target.name} hasn't finished the ${field} training yet (${status?.done ?? 0}/${status?.total ?? 0} courses)` },
      { status: 400 }
    );
  }

  // First promotion upgrades the account itself to an instructor role.
  let newRoleId = target.roleId;
  if (target.role.type === "TRAINEE") {
    const instructorRole = await prisma.role.findFirst({ where: { type: "INSTRUCTOR" }, orderBy: { name: "asc" } });
    if (!instructorRole) return NextResponse.json({ error: "No instructor role exists to promote into" }, { status: 400 });
    newRoleId = instructorRole.id;
  }

  const remaining = fields.filter((f) => f !== field);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      roleId: newRoleId,
      subPositions: remaining,
      subPosition: null, // legacy column is superseded by the arrays
      teacherPositions: [...new Set([...target.teacherPositions, field])],
      // Nothing left to train → fully trained by definition; otherwise keep
      // the flag for the remaining fields (recomputed on next certificate).
      ...(remaining.length === 0 ? { isTrained: true } : {}),
    },
    select: { id: true, name: true, subPositions: true, teacherPositions: true, roleId: true },
  });

  await prisma.notification.create({
    data: {
      userId: target.id,
      centreId: target.centreId,
      type: "PROMOTED_TEACHER",
      title: `🎉 You've been promoted — you're now a ${field} teacher!`,
      body: remaining.length > 0
        ? `Your ${remaining.join(", ")} training continues as before.`
        : "All your training fields are complete. Welcome to the teaching team!",
      link: "/instructor",
    },
  });

  await audit({
    actorId: viewer.id,
    action: "user.promoted_teacher",
    target: target.id,
    metadata: { field, remainingFields: remaining, roleUpgraded: newRoleId !== target.roleId },
  });

  return NextResponse.json({ ok: true, user: updated });
}
