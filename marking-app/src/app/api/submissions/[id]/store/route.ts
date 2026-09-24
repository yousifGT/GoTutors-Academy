import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zId, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { studentScope, submissionScope } from "@/lib/marking/access";

const StoreSchema = z.object({
  /** File it against a child who already exists. */
  studentId: zId.optional(),
  /** Or create that child now, from the results screen. */
  newStudent: z
    .object({
      admissionNumber: z.string().trim().min(1, "An admission number is required").max(40),
      name: zName,
      yearGroup: z.string().trim().max(40).optional().nullable(),
    })
    .optional(),
});

/**
 * Filing a quick-marked paper against a child.
 *
 * This is the "do you want to keep this?" step at the end of quick marking,
 * and it is also how a paper marked for the wrong child gets moved. Either an
 * existing student or a new one — never both, and never neither, because
 * "store it" with nothing to store it against is a silent no-op that looks
 * like it worked.
 */
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, StoreSchema);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.studentId === !parsed.data.newStudent) {
    return NextResponse.json({ error: "Pick a student, or add a new one — not both." }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    select: { id: true, studentId: true, reference: true },
  });
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });

  let student: { id: string; name: string; admissionNumber: string };

  if (parsed.data.studentId) {
    const found = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, ...studentScope(viewer) },
      select: { id: true, name: true, admissionNumber: true },
    });
    if (!found) return NextResponse.json({ error: "That student was not found." }, { status: 404 });
    student = found;
  } else {
    const details = parsed.data.newStudent!;
    const clash = await prisma.student.findFirst({
      where: { organisationId: viewer.organisationId, admissionNumber: details.admissionNumber },
      select: { id: true, name: true },
    });
    // Two children with one admission number makes every future search
    // ambiguous, so offer the existing child rather than creating a twin.
    if (clash) {
      return NextResponse.json(
        {
          error: `${clash.name} already has admission number ${details.admissionNumber}. Store it against them instead?`,
          existingStudentId: clash.id,
        },
        { status: 409 }
      );
    }
    student = await prisma.student.create({
      data: {
        organisationId: viewer.organisationId,
        admissionNumber: details.admissionNumber,
        name: details.name,
        yearGroup: details.yearGroup || null,
        tutorId: viewer.id,
      },
      select: { id: true, name: true, admissionNumber: true },
    });
  }

  await prisma.submission.update({
    where: { id: submission.id },
    // The reference was a stand-in for a name while the paper had none. Once it
    // has a child it is noise on every screen, so it goes.
    data: { studentId: student.id, reference: null },
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: submission.studentId ? "submission.move" : "submission.store",
    target: `submission:${submission.id}`,
    metadata: {
      student: student.name,
      admissionNumber: student.admissionNumber,
      createdStudent: !parsed.data.studentId,
      wasReference: submission.reference,
    },
  });

  return NextResponse.json({ ok: true, studentId: student.id, studentName: student.name });
});

/**
 * Discarding a quick-marked paper the centre does not want to keep.
 *
 * Only ever an unstored one: once a paper is filed against a child it is part of
 * that child's record, and deleting it belongs on their page with the warning
 * that goes with it — not behind a "no thanks" button at the end of marking.
 */
export const DELETE = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    select: { id: true, studentId: true },
  });
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (submission.studentId) {
    return NextResponse.json(
      { error: "This paper is part of a student's record. Delete it from their page instead." },
      { status: 409 }
    );
  }

  await prisma.submission.delete({ where: { id: submission.id } });
  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "submission.discard",
    target: `submission:${submission.id}`,
  });
  return NextResponse.json({ ok: true });
});
