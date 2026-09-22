import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";
import { markPaper } from "./marker";
import { checkMarking } from "./scoring";
import { feedbackFromMarks } from "./feedback";
import type { PaperPage, SchemeQuestion, WorkedExample } from "./types";
import type { MarkingStatus } from "@prisma/client";

/**
 * One marking run, end to end.
 *
 * Every exit leaves the submission in a state somebody can act on: MARKED (read
 * the report), NEEDS_HUMAN (mark it yourself — the reason says why), or FAILED
 * (press the button again). Nothing is ever left in MARKING, because a row
 * stuck in MARKING is invisible work: it reads as "in progress" forever and the
 * paper never gets marked at all.
 */

const MEDIA_TYPES: Record<string, PaperPage["mediaType"]> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export type MarkingRunResult = { status: MarkingStatus; reason?: string };

export async function runMarking(submissionId: string): Promise<MarkingRunResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { markScheme: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!submission) throw new Error(`No submission ${submissionId}`);

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "MARKING", failureReason: null } });

  try {
    const questions: SchemeQuestion[] = submission.markScheme.questions.map((q) => ({
      id: q.id,
      label: q.label,
      order: q.order,
      prompt: q.prompt,
      expectedAnswer: q.expectedAnswer,
      marks: q.marks,
      guidance: q.guidance,
    }));

    let pages: PaperPage[];
    try {
      pages = await loadPages(submission.pageUrls);
    } catch (err) {
      console.error("could not read paper pages", { submissionId, err });
      return finishUnmarked(submissionId, "NEEDS_HUMAN", "The uploaded photographs could not be read back from storage.");
    }

    const outcome = await markPaper({
      schemeTitle: submission.markScheme.title,
      subject: submission.markScheme.subject,
      level: submission.markScheme.level,
      questions,
      examples: await loadExamples(submission.markSchemeId),
      pages,
    });

    if (!outcome.ok) {
      return finishUnmarked(submissionId, outcome.retryable ? "FAILED" : "NEEDS_HUMAN", outcome.reason);
    }

    const checked = checkMarking(outcome.raw, questions);
    // The model's own feedback is preferred, but a report with an empty "what
    // went well" is a report nobody can use, so fall back to the marks.
    const derived = feedbackFromMarks(checked.marks);

    await prisma.$transaction([
      // A re-run replaces the previous attempt's marks rather than adding to
      // them — the unique key is (submission, label), so leaving them would
      // collide, and half-old-half-new marks are worse than either.
      prisma.submissionMark.deleteMany({ where: { submissionId } }),
      prisma.submissionMark.createMany({
        data: checked.marks.map((m, i) => ({
          submissionId,
          questionId: m.questionId,
          label: m.label,
          order: i,
          awarded: m.awarded,
          available: m.available,
          transcript: m.transcript,
          comment: m.comment,
          confidence: m.confidence,
          legible: m.legible,
          source: "AI" as const,
          edited: false,
        })),
      }),
      prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: checked.needsHuman ? "NEEDS_HUMAN" : "MARKED",
          awarded: checked.awarded,
          available: checked.available,
          overallComment: checked.overallComment,
          strengths: checked.strengths.length > 0 ? checked.strengths : derived.strengths,
          improvements: checked.improvements.length > 0 ? checked.improvements : derived.improvements,
          confidence: checked.confidence,
          model: outcome.model,
          markedAt: new Date(),
          failureReason: checked.needsHuman ? checked.reasons.join("; ") : null,
        },
      }),
    ]);

    return { status: checked.needsHuman ? "NEEDS_HUMAN" : "MARKED", reason: checked.reasons.join("; ") || undefined };
  } catch (err) {
    console.error("marking run failed", { submissionId, err });
    return finishUnmarked(submissionId, "FAILED", "Marking failed unexpectedly. Try again, or mark this paper by hand.");
  }
}

async function finishUnmarked(
  submissionId: string,
  status: Extract<MarkingStatus, "NEEDS_HUMAN" | "FAILED">,
  reason: string
): Promise<MarkingRunResult> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status, failureReason: reason, markedAt: null },
  });
  return { status, reason };
}

async function loadPages(urls: string[]): Promise<PaperPage[]> {
  const pages: PaperPage[] = [];
  for (const url of urls) {
    const { bytes, contentType } = await readUpload(url);
    const mediaType = MEDIA_TYPES[contentType.split(";")[0].trim().toLowerCase()];
    if (!mediaType) throw new Error(`Unsupported page type ${contentType} for ${url}`);
    pages.push({ data: bytes.toString("base64"), mediaType });
  }
  return pages;
}

/**
 * Every example kept for this scheme. `selectExamples` does the choosing — this
 * only bounds the query so an old, heavily-marked scheme doesn't load thousands
 * of rows to throw nearly all of them away.
 */
async function loadExamples(markSchemeId: string): Promise<WorkedExample[]> {
  const rows = await prisma.markingExample.findMany({
    where: { markSchemeId },
    orderBy: [{ source: "asc" }, { createdAt: "desc" }],
    take: 400,
  });
  return rows.map((r) => ({
    questionId: r.questionId,
    studentAnswer: r.studentAnswer,
    awarded: r.awarded,
    available: r.available,
    examinerComment: r.examinerComment,
    source: r.source,
    createdAt: r.createdAt,
  }));
}
