import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { parseJson, zId } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { schemeScope, studentScope } from "@/lib/marking/access";

/** One paper: its pages, and whatever the tutor called it while marking. */
const PaperSchema = z.object({
  reference: z.string().trim().max(120).optional().nullable(),
  pageUrls: z
    .array(z.string().min(1).max(1000))
    .min(1, "Attach at least one photo of the paper")
    .max(12, "A single paper can hold at most 12 pages"),
});

const SubmissionSchema = z.object({
  /**
   * Optional on purpose. Quick marking exists so a tutor can work through a
   * pile of papers without stopping to file each one; the paper is attached to
   * a child afterwards, from the results screen.
   */
  studentId: zId.optional().nullable(),
  markSchemeId: zId,
  /** Page URLs, in page order, as returned by /api/uploads/paper. */
  pageUrls: z.array(z.string().min(1).max(1000)).min(1).max(12).optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  /** Several papers marked against one scheme in a single quick-marking pass. */
  papers: z.array(PaperSchema).min(1).max(30).optional(),
});

/**
 * Creating a submission does NOT mark it.
 *
 * Marking takes tens of seconds, and a request that both uploads and marks is a
 * request that loses the upload when marking times out — the photos are gone
 * and the tutor has to take them again. So this commits the paper and returns;
 * the client then asks for it to be marked, and a failure there costs a button
 * press, not a re-shoot of a test that has gone home.
 */
export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, SubmissionSchema);
  if (!parsed.ok) return parsed.response;

  // One shape for both entry points: a single paper is a batch of one. Keeping
  // two code paths here is how the two flows would drift apart.
  const papers =
    parsed.data.papers ??
    (parsed.data.pageUrls
      ? [{ pageUrls: parsed.data.pageUrls, reference: parsed.data.reference ?? null }]
      : null);
  if (!papers) {
    return NextResponse.json({ error: "Attach at least one photo of the paper" }, { status: 400 });
  }

  const scheme = await prisma.markScheme.findFirst({
    where: { id: parsed.data.markSchemeId, ...schemeScope(viewer) },
    select: { id: true, title: true, _count: { select: { questions: true } } },
  });
  if (!scheme) return NextResponse.json({ error: "That mark scheme was not found." }, { status: 404 });
  if (scheme._count.questions === 0) {
    return NextResponse.json({ error: `"${scheme.title}" has no questions to mark against yet.` }, { status: 409 });
  }

  let student: { id: string; name: string } | null = null;
  if (parsed.data.studentId) {
    student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, ...studentScope(viewer) },
      select: { id: true, name: true },
    });
    if (!student) return NextResponse.json({ error: "That student was not found." }, { status: 404 });
  }

  // Papers marked together stay together, so the results screen and the
  // exported report can show the whole pile rather than one paper at a time.
  const batchId = papers.length > 1 ? randomUUID() : null;

  const created = await prisma.$transaction(
    papers.map((paper) =>
      prisma.submission.create({
        data: {
          organisationId: viewer.organisationId,
          studentId: student?.id ?? null,
          markSchemeId: scheme.id,
          uploadedById: viewer.id,
          pageUrls: paper.pageUrls,
          reference: paper.reference?.trim() || null,
          batchId,
          status: "PENDING",
        },
        select: { id: true, reference: true },
      })
    )
  );

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "submission.create",
    target: batchId ? `batch:${batchId}` : `submission:${created[0].id}`,
    metadata: {
      student: student?.name ?? null,
      scheme: scheme.title,
      papers: created.length,
      quick: !student,
    },
  });

  return NextResponse.json({
    id: created[0].id,
    batchId,
    submissions: created.map((c) => ({ id: c.id, reference: c.reference })),
  });
});
