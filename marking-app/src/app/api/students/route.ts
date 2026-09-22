import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zId, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";

const StudentSchema = z.object({
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

  const student = await prisma.student.create({
    data: {
      organisationId: viewer.organisationId,
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
