import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zAdmissionNumber, zId, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";

const StudentSchema = z.object({
  admissionNumber: zAdmissionNumber,
  name: zName,
  yearGroup: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Admins may file a student under another tutor; markers may not. */
  tutorId: zId.optional(),
});

export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, StudentSchema);
  if (!parsed.ok) return parsed.response;

  let tutorId = viewer.id;
  if (parsed.data.tutorId && parsed.data.tutorId !== viewer.id) {
    if (viewer.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const tutor = await prisma.user.findFirst({
      where: { id: parsed.data.tutorId, organisationId: viewer.organisationId, active: true },
      select: { id: true },
    });
    if (!tutor) return NextResponse.json({ error: "That tutor was not found." }, { status: 404 });
    tutorId = tutor.id;
  }

  // The admission number is the centre's own reference and how staff look a
  // child up, so a duplicate is a real mistake rather than a technicality —
  // two children sharing one makes every search ambiguous forever.
  const clash = await prisma.student.findFirst({
    where: { organisationId: viewer.organisationId, admissionNumber: parsed.data.admissionNumber },
    select: { name: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: `${clash.name} already has admission number ${parsed.data.admissionNumber}.` },
      { status: 409 }
    );
  }

  const student = await prisma.student.create({
    data: {
      organisationId: viewer.organisationId,
      admissionNumber: parsed.data.admissionNumber,
      name: parsed.data.name,
      yearGroup: parsed.data.yearGroup || null,
      notes: parsed.data.notes || null,
      tutorId,
    },
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "student.create",
    target: `student:${student.id}`,
    metadata: { name: student.name },
  });
  return NextResponse.json({ id: student.id });
});
