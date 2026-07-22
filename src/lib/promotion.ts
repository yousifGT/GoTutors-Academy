import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getFieldStatus } from "@/lib/field-training";
import { effectiveSubPositions, tutorTitleFor } from "@/lib/sub-positions";

export type PromoteResult =
  | { ok: true; tutorTitle: string; remaining: string[]; user: { id: string; name: string; subPositions: string[]; teacherPositions: string[]; roleId: string } }
  | { ok: false; error: string; status: number };

/**
 * Move one fully-trained field from training to tutoring. Shared core used by
 * the manual Promote button (authorization handled by the API route) and the
 * automatic upgrade when the field's final certificate lands.
 *
 * The ladder is Trainee → Tutor → (Supervisor) → Instructor; this only ever
 * climbs the first rung. A plain trainee account moves onto the "Tutor" role
 * (found by name, created on demand as a trainee-type role); enrolments and
 * certificates are untouched; remaining fields keep training.
 */
export async function promoteToTutor(
  targetId: string,
  field: string,
  opts: { actorId?: string | null; auto?: boolean } = {}
): Promise<PromoteResult> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { role: { select: { type: true } } },
  });
  if (!target) return { ok: false, error: "User not found", status: 404 };

  if (target.role.type !== "TRAINEE" && target.role.type !== "INSTRUCTOR") {
    return { ok: false, error: "Only trainees (or tutors still in training) can be promoted", status: 400 };
  }

  const fields = effectiveSubPositions(target);
  if (!fields.includes(field)) {
    return { ok: false, error: `${target.name} is not training as ${field}`, status: 400 };
  }

  const status = (await getFieldStatus(target)).find((f) => f.name === field);
  if (!status || !status.trained) {
    return {
      ok: false,
      error: `${target.name} hasn't finished the ${field} training yet (${status?.done ?? 0}/${status?.total ?? 0} courses)`,
      status: 400,
    };
  }

  // Promotion lands on the dedicated Tutor role — one rung up from trainee,
  // NOT instructor (course authoring stays a manual appointment). Instructors
  // finishing a leftover field just keep their role.
  let newRoleId = target.roleId;
  let landingType: string = target.role.type;
  if (target.role.type === "TRAINEE") {
    let tutorRole = await prisma.role.findFirst({ where: { name: { equals: "Tutor", mode: "insensitive" } } });
    tutorRole ??= await prisma.role.create({
      data: {
        name: "Tutor",
        type: "TRAINEE",
        description: "Fully trained in at least one field — the rung between trainee and instructor.",
      },
    });
    newRoleId = tutorRole.id;
    landingType = tutorRole.type;
  }

  const remaining = fields.filter((f) => f !== field);
  // The training field's name becomes a tutor title: "Maths Trainee" → "Maths Tutor".
  const tutorTitle = tutorTitleFor(field);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      roleId: newRoleId,
      subPositions: remaining,
      subPosition: null, // legacy column is superseded by the arrays
      teacherPositions: [...new Set([...target.teacherPositions, tutorTitle])],
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
      title: `🎉 You've been promoted — you're now a ${tutorTitle}!`,
      body: [
        opts.auto ? `You finished every ${field} course, so the upgrade happened automatically.` : null,
        remaining.length > 0 ? `Your ${remaining.join(", ")} training continues as before.` : "All your training fields are complete. Congratulations!",
      ]
        .filter(Boolean)
        .join(" "),
      link: landingType === "INSTRUCTOR" ? "/instructor" : "/trainee",
    },
  });

  await audit({
    actorId: opts.actorId ?? null,
    action: opts.auto ? "user.auto_promoted_tutor" : "user.promoted_teacher",
    target: target.id,
    metadata: { field, tutorTitle, remainingFields: remaining, roleUpgraded: newRoleId !== target.roleId, auto: !!opts.auto },
  });

  return { ok: true, tutorTitle, remaining, user: updated };
}

/**
 * Auto-promotion: called after a certificate lands. Any field the user has now
 * fully trained is upgraded to its tutor title immediately — no button needed.
 * Only the trainee→tutor rung is automated (trainee-type roles, which includes
 * Tutor itself for their remaining fields); instructors are never auto-changed.
 */
export async function autoPromoteTrainedFields(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { type: true } } },
  });
  if (!user || user.role.type !== "TRAINEE") return [];

  const trained = (await getFieldStatus(user)).filter((f) => f.trained).map((f) => f.name);
  const promoted: string[] = [];
  for (const field of trained) {
    const res = await promoteToTutor(userId, field, { auto: true });
    if (res.ok) promoted.push(field);
  }
  return promoted;
}
