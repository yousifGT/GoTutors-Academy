import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zId, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";

const PatchSchema = z.object({
  name: zName.optional(),
  yearGroup: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
  tutorId: zId.optional(),
});

/**
 * PATCH accepts exactly the fields the edit form shows, and resolves the
 * student through the same scope the list page uses — the read path and the
 * write path have to agree about who this person may touch, or a field becomes
 * editable in the UI and rejected by the API.
 */
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  const student = await prisma.student.findFirst({
    where: { id: params.id, ...studentScope(viewer) },
    select: { id: true },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { name, yearGroup, notes, active, tutorId } = parsed.data;
  if (tutorId && viewer.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (tutorId) {
    const tutor = await prisma.user.findFirst({
      where: { id: tutorId, organisationId: viewer.organisationId, active: true },
      select: { id: true },
    });
    if (!tutor) return NextResponse.json({ error: "That tutor was not found." }, { status: 404 });
  }

  await prisma.student.update({
    where: { id: student.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(yearGroup !== undefined ? { yearGroup: yearGroup || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(tutorId ? { tutorId } : {}),
    },
  });

  await audit({ organisationId: viewer.organisationId, actorId: viewer.id, action: "student.update", target: `student:${student.id}` });
  return NextResponse.json({ ok: true });
});

/**
 * Deleting a student deletes their marked papers with them — that is the point,
 * because it is how a parent's "remove my child's work" request is honoured.
 * Deactivating is the softer option the UI offers first.
 */
export const DELETE = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, ...studentScope(viewer) },
    select: { id: true, name: true, _count: { select: { submissions: true } } },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.student.delete({ where: { id: student.id } });
  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "student.delete",
    target: `student:${student.id}`,
    metadata: { name: student.name, papersDeleted: student._count.submissions },
  });
  return NextResponse.json({ ok: true });
});
