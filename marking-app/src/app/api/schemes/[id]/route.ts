import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { canEditScheme } from "@/lib/marking/access";
import { SchemeSchema, duplicateLabel } from "@/lib/marking/scheme-schema";

/**
 * Editing a scheme updates its questions IN PLACE, matched by label.
 *
 * Deleting and recreating them would be shorter and would throw away every
 * worked example attached to those questions — the entire record of how this
 * centre marks them — because MarkingExample cascades from the question.
 * Fixing a typo in the wording of a question must not reset its learning.
 */
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, SchemeSchema);
  if (!parsed.ok) return parsed.response;
  const clash = duplicateLabel(parsed.data.questions);
  if (clash) return NextResponse.json({ error: `Two questions are both labelled "${clash}".` }, { status: 409 });

  const scheme = await prisma.markScheme.findFirst({
    where: { id: params.id, organisationId: viewer.organisationId },
    include: { questions: true },
  });
  if (!scheme) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canEditScheme(viewer, scheme)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const byLabel = new Map(scheme.questions.map((q) => [q.label.trim().toLowerCase(), q]));
  const kept = new Set<string>();

  await prisma.$transaction(async (tx) => {
    await tx.markScheme.update({
      where: { id: scheme.id },
      data: {
        title: parsed.data.title,
        subject: parsed.data.subject,
        level: parsed.data.level || null,
        shared: parsed.data.shared ?? scheme.shared,
      },
    });

    for (const [i, q] of parsed.data.questions.entries()) {
      const existing = byLabel.get(q.label.trim().toLowerCase());
      const data = {
        order: i,
        label: q.label.trim(),
        prompt: q.prompt,
        expectedAnswer: q.expectedAnswer,
        marks: q.marks,
        guidance: q.guidance || null,
      };
      if (existing) {
        kept.add(existing.id);
        await tx.markSchemeQuestion.update({ where: { id: existing.id }, data });
      } else {
        await tx.markSchemeQuestion.create({ data: { ...data, markSchemeId: scheme.id } });
      }
    }

    const removed = scheme.questions.filter((q) => !kept.has(q.id)).map((q) => q.id);
    if (removed.length > 0) await tx.markSchemeQuestion.deleteMany({ where: { id: { in: removed } } });
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "scheme.update",
    target: `scheme:${scheme.id}`,
    metadata: { title: parsed.data.title, questions: parsed.data.questions.length },
  });
  return NextResponse.json({ ok: true });
});

/**
 * A scheme with marked papers against it cannot be deleted.
 *
 * Those papers reference it for their denominators and their question text, so
 * deleting it would turn every report made from it into a list of numbers with
 * nothing to compare them against. Archiving hides it from the pickers instead.
 */
export const DELETE = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const scheme = await prisma.markScheme.findFirst({
    where: { id: params.id, organisationId: viewer.organisationId },
    select: { id: true, title: true, ownerId: true, organisationId: true, _count: { select: { submissions: true } } },
  });
  if (!scheme) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canEditScheme(viewer, scheme)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (scheme._count.submissions > 0) {
    await prisma.markScheme.update({ where: { id: scheme.id }, data: { archived: true } });
    await audit({ organisationId: viewer.organisationId, actorId: viewer.id, action: "scheme.archive", target: `scheme:${scheme.id}` });
    return NextResponse.json({
      archived: true,
      message: `"${scheme.title}" has ${scheme._count.submissions} marked paper${
        scheme._count.submissions === 1 ? "" : "s"
      } against it, so it was archived rather than deleted.`,
    });
  }

  await prisma.markScheme.delete({ where: { id: scheme.id } });
  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "scheme.delete",
    target: `scheme:${scheme.id}`,
    metadata: { title: scheme.title },
  });
  return NextResponse.json({ ok: true });
});
