import { prisma } from "@/lib/prisma";
import { effectiveSubPositions, tutoredFieldNames } from "@/lib/sub-positions";

/**
 * Per-field ("sub-position") training status. A user is trained IN A FIELD when
 * they hold a certificate for every published course assigned to that field —
 * so someone can be a fully-trained Maths Tutor while still an English Tutor
 * trainee. Fields with no courses defined yet are never "trained" (there is
 * nothing to have finished).
 *
 * Both populations are reported: fields the user is still TRAINING in, and
 * fields they are qualified to TUTOR. Only tracking the first meant a promoted
 * tutor's field stopped being evaluated entirely, so publishing a new course in
 * it changed nothing for them — they were never enrolled and never told, and
 * their tutor status stood on requirements that no longer matched. A tutored
 * field whose courses are no longer all certified is `retraining`: they keep the
 * title, pick up the new course, and clear the flag by finishing it.
 */
export type FieldStatus = {
  name: string;
  total: number; // published courses this field requires
  done: number; // certificates held among them
  trained: boolean;
  /** How the user holds this field. */
  held: "training" | "tutoring";
  /**
   * Tutoring a field that has gained a requirement they haven't met. Never true
   * for a field with no courses — nothing outstanding means nothing to retrain.
   */
  retraining: boolean;
  /** Most recent certificate among the field's courses — the qualification date. */
  lastCertifiedAt: Date | null;
};

type FieldUser = {
  id: string;
  roleId: string;
  subPosition: string | null;
  subPositions: string[];
  teacherPositions?: string[];
  role: { type: string };
};

/** The sub-position names that exist, needed to map stored tutor titles back to fields. */
async function knownFieldNames(): Promise<string[]> {
  const rows = await prisma.subPosition.findMany({ select: { name: true } });
  return [...new Set(rows.map((r) => r.name))];
}

/** Training fields first, then tutored fields not already covered. */
function fieldsFor(user: FieldUser, knownFields: string[]): { name: string; held: "training" | "tutoring" }[] {
  const training = effectiveSubPositions(user);
  const seen = new Set(training);
  const out: { name: string; held: "training" | "tutoring" }[] = training.map((name) => ({ name, held: "training" }));
  for (const name of tutoredFieldNames(user.teacherPositions ?? [], knownFields)) {
    // A field can't sensibly be both; promotion removes it from subPositions.
    // If the data ever says both, the training requirement is the stricter read.
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, held: "tutoring" });
  }
  return out;
}

type HeldCert = { issuedAt: Date; courseVersion: number | null };

function buildStatus(
  field: { name: string; held: "training" | "tutoring" },
  required: { id: string; minCertifiedVersion: number }[],
  certified: Map<string, HeldCert>
): FieldStatus {
  // A certificate only counts if it was earned against a version that still
  // stands. A null version predates versioning, so it reads as 0 and is
  // superseded by any raised floor.
  const held = required.filter((c) => {
    const cert = certified.get(c.id);
    return !!cert && (cert.courseVersion ?? 0) >= c.minCertifiedVersion;
  });
  const dates = held.map((c) => certified.get(c.id)!.issuedAt);
  const trained = required.length > 0 && held.length === required.length;
  return {
    name: field.name,
    total: required.length,
    done: held.length,
    trained,
    held: field.held,
    retraining: field.held === "tutoring" && required.length > 0 && held.length < required.length,
    lastCertifiedAt: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
  };
}

/**
 * Batched variant: per-field status for many users in a few queries. Map key is
 * the user id.
 */
export async function getFieldStatusForUsers(users: FieldUser[]): Promise<Map<string, FieldStatus[]>> {
  const result = new Map<string, FieldStatus[]>();
  const knownFields = await knownFieldNames();
  const fieldsByUser = new Map(users.map((u) => [u.id, fieldsFor(u, knownFields)]));
  const allFields = [...new Set([...fieldsByUser.values()].flat().map((f) => f.name))];
  if (allFields.length === 0) {
    for (const u of users) result.set(u.id, []);
    return result;
  }

  const courses = await prisma.course.findMany({
    where: {
      published: true,
      roleAssignments: { some: { role: { type: "TRAINEE" }, subPosition: { in: allFields } } },
    },
    select: {
      id: true,
      minCertifiedVersion: true,
      roleAssignments: {
        where: { role: { type: "TRAINEE" }, subPosition: { in: allFields } },
        select: { roleId: true, subPosition: true },
      },
    },
  });

  const certs = await prisma.certificate.findMany({
    where: { userId: { in: users.map((u) => u.id) }, courseId: { in: courses.map((c) => c.id) } },
    select: { userId: true, courseId: true, issuedAt: true, courseVersion: true },
  });
  const certsByUser = new Map<string, Map<string, HeldCert>>();
  for (const c of certs) {
    const m = certsByUser.get(c.userId) ?? new Map<string, HeldCert>();
    m.set(c.courseId, { issuedAt: c.issuedAt, courseVersion: c.courseVersion });
    certsByUser.set(c.userId, m);
  }

  for (const user of users) {
    const certifiedAt = certsByUser.get(user.id) ?? new Map<string, HeldCert>();
    result.set(
      user.id,
      (fieldsByUser.get(user.id) ?? []).map((field) =>
        buildStatus(field, courses.filter((c) => c.roleAssignments.some((ra) => ra.subPosition === field.name)), certifiedAt)
      )
    );
  }
  return result;
}

export async function getFieldStatus(user: FieldUser): Promise<FieldStatus[]> {
  const knownFields = await knownFieldNames();
  const fields = fieldsFor(user, knownFields);
  if (fields.length === 0) return [];

  // Matched by sub-position name across trainee-type roles, so the count
  // survives moving between rungs (Trainee → Tutor → Instructor).
  const names = fields.map((f) => f.name);
  const assignmentFilter = { role: { type: "TRAINEE" as const }, subPosition: { in: names } };

  const courses = await prisma.course.findMany({
    where: { published: true, roleAssignments: { some: assignmentFilter } },
    select: {
      id: true,
      minCertifiedVersion: true,
      roleAssignments: { where: assignmentFilter, select: { subPosition: true } },
    },
  });

  const certs = await prisma.certificate.findMany({
    where: { userId: user.id, courseId: { in: courses.map((c) => c.id) } },
    select: { courseId: true, issuedAt: true, courseVersion: true },
  });
  const certifiedAt = new Map(certs.map((c) => [c.courseId, { issuedAt: c.issuedAt, courseVersion: c.courseVersion }]));

  return fields.map((field) =>
    buildStatus(field, courses.filter((c) => c.roleAssignments.some((ra) => ra.subPosition === field.name)), certifiedAt)
  );
}
