import { prisma } from "@/lib/prisma";
import { effectiveSubPositions, tutorTitleFor, tutoredFieldNames } from "@/lib/sub-positions";

/** The trainee sub-positions a course counts towards (its trainee-targeted assignments). */
export async function courseTraineeFields(courseId: string): Promise<string[]> {
  const rows = await prisma.courseRoleAssignment.findMany({
    where: { courseId, subPosition: { not: null }, role: { type: "TRAINEE" } },
    select: { subPosition: true },
  });
  return [...new Set(rows.map((r) => r.subPosition as string))];
}

/**
 * Recompute isTrained for every user holding any of these sub-positions.
 * Call whenever the REQUIREMENT changes rather than a user's own progress —
 * a course being published, unpublished, re-targeted or deleted changes what
 * "finished everything" means for those fields, so the stored flag would
 * otherwise go stale in either direction.
 */
export async function recomputeIsTrainedForFields(fields: string[]): Promise<number> {
  const names = [...new Set(fields.filter(Boolean))];
  if (names.length === 0) return 0;
  const users = await prisma.user.findMany({
    where: {
      role: { type: { in: ["TRAINEE", "INSTRUCTOR"] } },
      OR: [
        { subPositions: { hasSome: names } },
        { subPosition: { in: names } },
        // Tutors of these fields too — their requirement just changed, which is
        // the whole point of the lapse rule. teacherPositions stores the title.
        { teacherPositions: { hasSome: names.map(tutorTitleFor) } },
      ],
    },
    select: { id: true },
  });
  for (const u of users) await recomputeIsTrained(u.id);
  return users.length;
}

/**
 * Recompute whether a trainee has completed every course assigned to their sub-positions
 * and set User.isTrained accordingly. Idempotent.
 *
 * Trainees remain on the TRAINEE role after being trained; a Super Admin can manually
 * promote them to another role via the user edit page.
 */
export async function recomputeIsTrained(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  // Anyone still holding training sub-positions keeps training, whatever role
  // rung they're on (Trainee, Tutor — a trainee-type role — or Instructor).
  if (!user || (user.role.type !== "TRAINEE" && user.role.type !== "INSTRUCTOR")) {
    return user?.isTrained ?? false;
  }
  // Fields still in training PLUS fields already tutored.
  //
  // Reading only subPositions left the flag permanently stuck. A fully promoted
  // person has an EMPTY subPositions array — every field moved into
  // teacherPositions — so this returned early on exactly the population whose
  // requirements can still change underneath them. Publish a new course in a
  // field they tutor and the per-field status correctly reported "retraining"
  // while this flag went on claiming "Trained" forever, with no way to clear it.
  const knownFields = (await prisma.subPosition.findMany({ select: { name: true } })).map((r) => r.name);
  const fields = [
    ...new Set([...effectiveSubPositions(user), ...tutoredFieldNames(user.teacherPositions ?? [], knownFields)]),
  ];
  if (fields.length === 0) return user.isTrained;

  // Every published course assigned to any of those fields. Matched by field
  // name across trainee-type roles (not the user's exact roleId), so moving
  // between rungs (Trainee → Tutor) never breaks the count.
  const required = await prisma.course.findMany({
    where: {
      published: true,
      roleAssignments: { some: { role: { type: "TRAINEE" }, subPosition: { in: fields } } },
    },
    select: { id: true, minCertifiedVersion: true },
  });

  if (required.length === 0) {
    // No courses defined for these fields — leave as-is.
    return user.isTrained;
  }

  // A certificate only counts if it was earned against a version that still
  // stands — the same rule field-training.ts applies, so this flag and the
  // per-field status can no longer disagree. A null version predates versioning,
  // so it reads as 0 and is superseded by any raised floor.
  const certs = await prisma.certificate.findMany({
    where: { userId, courseId: { in: required.map((c) => c.id) } },
    select: { courseId: true, courseVersion: true },
  });
  const versionByCourse = new Map(certs.map((c) => [c.courseId, c.courseVersion]));
  const held = required.filter(
    (c) => versionByCourse.has(c.id) && (versionByCourse.get(c.id) ?? 0) >= c.minCertifiedVersion
  );

  const trained = held.length === required.length;
  if (trained !== user.isTrained) {
    await prisma.user.update({ where: { id: userId }, data: { isTrained: trained } });
  }
  return trained;
}
