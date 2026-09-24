import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { ReportPaper } from "./report-pdf";
import { paperOwnerLabel } from "./paper-label";

/**
 * Loading papers in the shape the report wants.
 *
 * Shared by the single-paper export and the batch export so the two cannot
 * drift — a report that says something different depending on which button
 * produced it is worse than having only one button.
 */
export async function loadReportPapers(where: Prisma.SubmissionWhereInput): Promise<ReportPaper[]> {
  const submissions = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      student: { select: { name: true, admissionNumber: true, yearGroup: true } },
      markScheme: { select: { title: true, subject: true, level: true, questions: true } },
      marks: { orderBy: { order: "asc" } },
    },
  });

  return submissions.map((s) => {
    const questionByLabel = new Map(s.markScheme.questions.map((q) => [q.label.trim().toLowerCase(), q]));
    return {
      studentName: paperOwnerLabel(s),
      admissionNumber: s.student?.admissionNumber ?? null,
      yearGroup: s.student?.yearGroup ?? null,
      schemeTitle: s.markScheme.title,
      subject: s.markScheme.subject,
      level: s.markScheme.level,
      date: s.markedAt ?? s.createdAt,
      awarded: s.awarded ?? 0,
      available: s.available ?? 0,
      overallComment: s.overallComment ?? "",
      strengths: s.strengths,
      improvements: s.improvements,
      marks: s.marks
        // A mark for a question the scheme no longer has is working-out, not
        // something to put in front of a parent.
        .filter((m) => m.available > 0)
        .map((m) => {
          const question = questionByLabel.get(m.label.trim().toLowerCase());
          return {
            label: m.label,
            prompt: question?.prompt ?? "",
            expectedAnswer: question?.expectedAnswer ?? "",
            transcript: m.transcript,
            comment: m.comment,
            awarded: m.awarded,
            available: m.available,
          };
        }),
    };
  });
}
