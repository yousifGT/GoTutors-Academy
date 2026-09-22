import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { canReviewSubmission, submissionScope } from "@/lib/marking/access";
import { countCorrections, examplesFromReview, type ReviewedMark } from "@/lib/marking/learning";
import { feedbackFromMarks, summarise } from "@/lib/marking/feedback";
import { percentageOf } from "@/lib/marking/scoring";
import type { CheckedMark } from "@/lib/marking/types";

const ReviewSchema = z.object({
  marks: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        awarded: z.number().int().min(0).max(1000),
        transcript: z.string().max(4000),
        comment: z.string().max(2000),
      })
    )
    .max(200),
  overallComment: z.string().max(4000).optional(),
  strengths: z.array(z.string().max(500)).max(10).optional(),
  improvements: z.array(z.string().max(500)).max(10).optional(),
  note: z.string().max(2000).optional(),
});

/**
 * A person marking, or correcting, a paper.
 *
 * This is both halves of the promise the product makes: the human fallback for
 * work the reader could not handle, and the only way the system gets better.
 * Everything done here is written back as worked examples, so the next paper on
 * the same question is marked the way this person marked it.
 *
 * The human's numbers are final. Nothing here re-checks or "adjusts" them — the
 * only clamp is to the mark scheme's own maximum, because a question worth 3
 * cannot score 4 whoever typed it.
 */
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, ReviewSchema);
  if (!parsed.ok) return parsed.response;

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    include: { marks: true, markScheme: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canReviewSubmission(viewer, submission)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const questions = submission.markScheme.questions;
  if (questions.length === 0) {
    return NextResponse.json({ error: "This mark scheme no longer has any questions." }, { status: 409 });
  }

  const existingByLabel = new Map(submission.marks.map((m) => [m.label.trim().toLowerCase(), m]));
  const submitted = new Map(parsed.data.marks.map((m) => [m.label.trim().toLowerCase(), m]));

  // The scheme decides which questions exist, not the form. A question the form
  // forgot is a zero that a person still signed off, not a question that
  // disappears from the denominator.
  const reviewed: (ReviewedMark & { questionId: string; label: string; order: number; available: number })[] = [];
  for (const [i, q] of questions.entries()) {
    const key = q.label.trim().toLowerCase();
    const sent = submitted.get(key);
    const previous = existingByLabel.get(key);
    const awarded = Math.min(Math.max(sent?.awarded ?? previous?.awarded ?? 0, 0), q.marks);
    const transcript = sent?.transcript ?? previous?.transcript ?? "";
    const comment = sent?.comment ?? previous?.comment ?? "";
    const edited =
      !previous ||
      previous.source === "HUMAN" ||
      previous.awarded !== awarded ||
      previous.comment.trim() !== comment.trim();

    reviewed.push({
      questionId: q.id,
      label: q.label,
      order: i,
      awarded,
      available: q.marks,
      transcript,
      comment,
      edited,
    });
  }

  const awarded = reviewed.reduce((sum, m) => sum + m.awarded, 0);
  const available = reviewed.reduce((sum, m) => sum + m.available, 0);

  // Feedback the person typed wins; otherwise derive it from the marks they
  // just set, so a hand-marked paper still produces a usable report.
  const asChecked: CheckedMark[] = reviewed.map((m) => ({
    questionId: m.questionId,
    label: m.label,
    order: m.order,
    awarded: m.awarded,
    available: m.available,
    transcript: m.transcript,
    comment: m.comment,
    confidence: 1,
    legible: true,
    needsHuman: false,
    reasons: [],
  }));
  const derived = feedbackFromMarks(asChecked);
  const strengths = (parsed.data.strengths ?? []).filter((s) => s.trim());
  const improvements = (parsed.data.improvements ?? []).filter((s) => s.trim());

  const drafts = examplesFromReview(reviewed);
  const counts = countCorrections(reviewed);

  await prisma.$transaction(async (tx) => {
    for (const m of reviewed) {
      const fields = {
        questionId: m.questionId,
        order: m.order,
        awarded: m.awarded,
        available: m.available,
        transcript: m.transcript,
        comment: m.comment,
        confidence: 1,
        legible: true,
        source: "HUMAN" as const,
        edited: m.edited,
      };
      await tx.submissionMark.upsert({
        where: { submissionId_label: { submissionId: submission.id, label: m.label } },
        create: { submissionId: submission.id, label: m.label, ...fields },
        update: fields,
      });
    }

    // Marks for questions the scheme no longer contains were kept so a human
    // could see what the reader thought it saw. Once a human has been through
    // the paper, they have served their purpose.
    const keep = new Set(reviewed.map((m) => m.label));
    const strays = submission.marks.filter((m) => !keep.has(m.label)).map((m) => m.id);
    if (strays.length > 0) await tx.submissionMark.deleteMany({ where: { id: { in: strays } } });

    // Replace this paper's examples rather than adding to them: reviewing twice
    // must not teach the same answer twice and weight it double.
    await tx.markingExample.deleteMany({ where: { submissionId: submission.id } });
    if (drafts.length > 0) {
      await tx.markingExample.createMany({
        data: drafts.map((d) => ({
          markSchemeId: submission.markSchemeId,
          questionId: d.questionId,
          submissionId: submission.id,
          studentAnswer: d.studentAnswer,
          awarded: d.awarded,
          available: d.available,
          examinerComment: d.examinerComment,
          source: d.source,
        })),
      });
    }

    await tx.submission.update({
      where: { id: submission.id },
      data: {
        status: "REVIEWED",
        awarded,
        available,
        confidence: 1,
        overallComment: parsed.data.overallComment?.trim() || summarise(awarded, available),
        strengths: strengths.length > 0 ? strengths : derived.strengths,
        improvements: improvements.length > 0 ? improvements : derived.improvements,
        reviewedById: viewer.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.note?.trim() || null,
        failureReason: null,
        markedAt: submission.markedAt ?? new Date(),
      },
    });
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "submission.review",
    target: `submission:${submission.id}`,
    metadata: {
      awarded,
      available,
      percentage: percentageOf(awarded, available),
      corrected: counts.corrected,
      confirmed: counts.confirmed,
      examplesKept: drafts.length,
    },
  });

  return NextResponse.json({ ok: true, awarded, available, examplesKept: drafts.length, ...counts });
});
