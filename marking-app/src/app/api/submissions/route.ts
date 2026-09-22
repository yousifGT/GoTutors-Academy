import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zId } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { schemeScope, studentScope } from "@/lib/marking/access";

const SubmissionSchema = z.object({
  studentId: zId,
  markSchemeId: zId,
  /** Page URLs, in page order, as returned by /api/uploads/paper. */
  pageUrls: z
    .array(z.string().min(1).max(1000))
    .min(1, "Attach at least one photo of the paper")
    .max(12, "A single upload can hold at most 12 pages"),
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

  const [student, scheme] = await Promise.all([
    prisma.student.findFirst({
      where: { id: parsed.data.studentId, ...studentScope(viewer) },
      select: { id: true, name: true },
    }),
    prisma.markScheme.findFirst({
      where: { id: parsed.data.markSchemeId, ...schemeScope(viewer) },
      select: { id: true, title: true, _count: { select: { questions: true } } },
    }),
  ]);
  if (!student) return NextResponse.json({ error: "That student was not found." }, { status: 404 });
  if (!scheme) return NextResponse.json({ error: "That mark scheme was not found." }, { status: 404 });
  if (scheme._count.questions === 0) {
    return NextResponse.json({ error: `"${scheme.title}" has no questions to mark against yet.` }, { status: 409 });
  }

  const submission = await prisma.submission.create({
    data: {
      organisationId: viewer.organisationId,
      studentId: student.id,
      markSchemeId: scheme.id,
      uploadedById: viewer.id,
      pageUrls: parsed.data.pageUrls,
      status: "PENDING",
    },
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "submission.create",
    target: `submission:${submission.id}`,
    metadata: { student: student.name, scheme: scheme.title, pages: parsed.data.pageUrls.length },
  });
  return NextResponse.json({ id: submission.id });
});
