import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canEditInspection, receivesReports } from "@/lib/access";
import { canSubmit, scoreDbInspection, type AnswerRow, type SectionRow } from "@/lib/score";

type Ctx = { params: { id: string } };

/**
 * Close an inspection.
 *
 * The score is computed here, on the server, from the stored answers — never
 * taken from the client. Each answer's own fraction and bucket are written back
 * alongside it so later analytics ("which questions fail most often") don't have
 * to re-derive them, and so a bucket is always the one that was computed with
 * this inspection's centre size.
 *
 * Submission is refused while anything is outstanding: an unanswered question, a
 * missing note, or a critical failure with no photo evidence. Those are the same
 * checks the inspector sees on screen, enforced again where it counts.
 */
export const POST = withRoute(async (_req: Request, { params }: Ctx) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      centre: { select: { id: true, managers: { select: { id: true, role: true } } } },
      template: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { questions: { orderBy: { order: "asc" } } },
          },
        },
      },
      answers: { include: { entries: { include: { photos: true } } } },
    },
  });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!canEditInspection(who.viewer, inspection))
    return NextResponse.json(
      { error: inspection.status === "SUBMITTED" ? "Already submitted" : "forbidden" },
      { status: 403 }
    );

  const sections: SectionRow[] = inspection.template.sections.map((s) => ({
    title: s.title,
    questions: s.questions,
  }));
  const answers: AnswerRow[] = inspection.answers.map((a) => ({
    questionId: a.questionId,
    answer: a.answer,
    entries: a.entries,
  }));

  const score = scoreDbInspection(sections, answers, inspection.size);
  if (!canSubmit(score)) {
    return NextResponse.json(
      {
        error: "Inspection is not complete",
        unanswered: score.unanswered,
        unansweredCritical: score.unansweredCritical,
        missingNotes: score.missingNotes,
        missingPhotos: score.missingPhotos,
      },
      { status: 422 }
    );
  }

  await prisma.$transaction([
    ...score.answers.map((a) =>
      prisma.answer.update({
        where: { inspectionId_questionId: { inspectionId: inspection.id, questionId: a.questionId } },
        data: { scoreFraction: a.scoreFraction, bucket: a.bucket, questionText: a.questionText },
      })
    ),
    prisma.inspection.update({
      where: { id: inspection.id },
      data: {
        status: "SUBMITTED",
        endedAt: new Date(),
        scorePct: score.pct,
        verdict: score.verdict.word,
      },
    }),
  ]);

  // Put the finished report in front of whoever runs this centre. Delivery is a
  // row rather than a notification: an unread one is still there tomorrow, so a
  // report cannot be missed by being glanced past.
  const recipients = inspection.centre.managers.filter((m) => receivesReports(m.role));
  if (recipients.length) {
    await prisma.reportDelivery.createMany({
      data: recipients.map((m) => ({ inspectionId: inspection.id, userId: m.id })),
      skipDuplicates: true,
    });
  }

  await audit({
    actorId: who.viewer.id,
    action: "inspection.submit",
    target: inspection.id,
    metadata: {
      centreId: inspection.centreId,
      size: inspection.size,
      pct: score.pct,
      verdict: score.verdict.word,
      criticalFails: score.criticalFails,
      deliveredTo: recipients.length,
    },
  });

  return NextResponse.json({
    ok: true,
    deliveredTo: recipients.length,
    pct: score.pct,
    verdict: score.verdict,
    criticalFails: score.criticalFails,
    well: score.well,
    improve: score.poor,
    observations: score.obs,
  });
});
