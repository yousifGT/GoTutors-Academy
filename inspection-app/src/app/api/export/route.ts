import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { answerText } from "@/lib/core";
import { toCoreItem } from "@/lib/score";
import { compare } from "@/lib/progress";
import { filename } from "@/lib/csv";
import { answersCsv, inspectionsCsv, joinNotes, type ExportAnswer, type ExportInspection } from "@/lib/export";
import { describeFilters, inspectionWhere, parseInspectionFilters } from "@/lib/inspection-query";
import type { Prisma } from "@prisma/client";

/**
 * The same inspections as the list screen, as a spreadsheet.
 *
 * Two shapes: one row per inspection, for how the centres are doing; one row
 * per answer, for which questions keep failing. Both go through
 * `inspectionWhere`, the same filter the screen uses, so the file can never
 * cover a different set from the page it was taken from.
 *
 * It adds no visibility. Everything in it is something the viewer can already
 * open one report at a time — this is the same data in a shape a person can
 * work with. What it does change is how much of it leaves in one go, from a
 * system holding photographs taken in a children's setting, so every export is
 * written to the audit log with who, what, and how much.
 */

/**
 * Enough for a year across every centre, and small enough that one request
 * cannot pull the whole database into memory. The answers file is a hundred
 * rows per inspection, hence the lower bound. Past either, the answer is to
 * narrow the range — and saying so beats a truncated file that looks complete.
 */
const MAX_INSPECTIONS = 2_000;
const MAX_FOR_ANSWERS = 500;

function csv(body: string, name: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      // People-data. It must not sit in a shared cache or a proxy.
      "cache-control": "no-store",
    },
  });
}

/**
 * Every submitted visit to the centres involved, so each row can be compared
 * with the visit before it even when that visit falls outside the export's date
 * range — "still not fixed" in a March export must mean what it means in the
 * March report.
 *
 * Deliberately not narrowed to what this viewer may read, matching
 * `previouslyFlaggedAt` behind the on-screen report: the comparison uses only
 * the wording of a question flagged at the last visit, and a file that
 * disagreed with the report it was taken from would be worse than one that does
 * not.
 */
async function priorVisits(centreIds: string[]) {
  const history = centreIds.length
    ? await prisma.inspection.findMany({
        where: { centreId: { in: centreIds }, status: "SUBMITTED" },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: { id: true, centreId: true, date: true, answers: { select: { questionText: true, bucket: true } } },
      })
    : [];

  const byCentre = new Map<string, typeof history>();
  for (const h of history) {
    const list = byCentre.get(h.centreId);
    if (list) list.push(h);
    else byCentre.set(h.centreId, [h]);
  }

  /**
   * The visit before this one at the same centre — the same rule
   * `previouslyFlaggedAt` applies behind the report, so the spreadsheet and the
   * report never disagree about what "since the last visit" means.
   *
   * For a submitted inspection that is simply the next one along in the
   * ordering, which settles two visits sharing a date by when they were
   * created. A draft is not in the history at all, so it falls back to the most
   * recent submitted visit on or before its date.
   */
  return (r: { id: string; centreId: string; date: Date }) => {
    const list = byCentre.get(r.centreId) ?? [];
    const at = list.findIndex((h) => h.id === r.id);
    if (at >= 0) return list[at + 1] ?? null;
    return list.find((h) => h.date <= r.date) ?? null;
  };
}

export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const url = new URL(req.url);
  const wantsAnswers = url.searchParams.get("type") === "answers";
  const filters = parseInspectionFilters(url);
  const where = inspectionWhere(who.viewer, filters);
  const cap = wantsAnswers ? MAX_FOR_ANSWERS : MAX_INSPECTIONS;

  const total = await prisma.inspection.count({ where });
  if (total > cap)
    return NextResponse.json(
      {
        error: `That is ${total} inspections, and this export covers up to ${cap} at a time. Narrow it by centre or by month and take it in parts.`,
      },
      { status: 400 }
    );

  const order: Prisma.InspectionOrderByWithRelationInput[] = [{ date: "desc" }, { createdAt: "desc" }];
  const on = new Date();
  const named = (rows: { centre: { name: string } }[]) => (filters.centreId ? (rows[0]?.centre.name ?? null) : null);

  if (wantsAnswers) {
    const rows = await prisma.inspection.findMany({
      where,
      orderBy: order,
      take: cap,
      select: {
        id: true,
        centreId: true,
        date: true,
        centre: { select: { name: true } },
        inspector: { select: { name: true } },
        answers: {
          select: {
            questionId: true,
            questionText: true,
            answer: true,
            scoreFraction: true,
            bucket: true,
            question: { include: { section: { select: { title: true, order: true } } } },
            entries: {
              orderBy: { order: "asc" },
              select: { who: true, note: true, photos: { select: { id: true } } },
            },
          },
        },
      },
    });

    const prior = await priorVisits(Array.from(new Set(rows.map((r) => r.centreId))));
    const out: ExportAnswer[] = [];
    for (const r of rows) {
      const before = prior(r);
      const flaggedBefore = new Set(
        (before?.answers ?? []).filter((a) => a.bucket === "IMPROVE").map((a) => a.questionText)
      );
      // Walking order: the order the inspector met them in on the day.
      const sorted = r.answers
        .slice()
        .sort((a, b) =>
          a.question.section.order !== b.question.section.order
            ? a.question.section.order - b.question.section.order
            : a.question.order - b.question.order
        );
      for (const a of sorted) {
        out.push({
          inspectionId: r.id,
          date: r.date,
          centre: r.centre.name,
          inspector: r.inspector.name,
          section: a.question.section.title,
          // The wording as it was on the day, not as the checklist reads now.
          question: a.questionText,
          type: a.question.type,
          critical: a.question.critical,
          // Read through the same rules the report and the PDF use, so the
          // spreadsheet says "Pass" where they say "Pass", not "pass".
          answer: answerText(toCoreItem(a.question, { questionId: a.questionId, answer: a.answer, entries: [] })),
          bucket: a.bucket,
          scoreFraction: a.scoreFraction,
          repeat: a.bucket === "IMPROVE" && flaggedBefore.has(a.questionText),
          notes: joinNotes(a.entries),
          photos: a.entries.reduce((n, e) => n + e.photos.length, 0),
        });
      }
    }

    await audit({
      actorId: who.viewer.id,
      action: "export.answers",
      metadata: { rows: out.length, inspections: rows.length, filters: describeFilters(filters) },
    });
    return csv(answersCsv(out), filename(["answers", named(rows)], on));
  }

  const rows = await prisma.inspection.findMany({
    where,
    orderBy: order,
    take: cap,
    select: {
      id: true,
      centreId: true,
      date: true,
      size: true,
      status: true,
      scorePct: true,
      verdict: true,
      activeMs: true,
      debriefName: true,
      debriefRole: true,
      targets: true,
      centre: { select: { name: true } },
      inspector: { select: { name: true } },
      template: { select: { version: true } },
      answers: { select: { questionText: true, bucket: true, question: { select: { critical: true } } } },
    },
  });

  const prior = await priorVisits(Array.from(new Set(rows.map((r) => r.centreId))));
  const out: ExportInspection[] = rows.map((r) => {
    const before = prior(r);
    const moved = before ? compare(r.answers, before.answers) : null;
    return {
      id: r.id,
      date: r.date,
      centre: r.centre.name,
      size: r.size,
      inspector: r.inspector.name,
      status: r.status,
      scorePct: r.scorePct,
      verdict: r.verdict,
      activeMs: r.activeMs,
      checklistVersion: r.template.version,
      debriefName: r.debriefName,
      debriefRole: r.debriefRole,
      targets: r.targets,
      counts: {
        well: r.answers.filter((a) => a.bucket === "WELL").length,
        improve: r.answers.filter((a) => a.bucket === "IMPROVE").length,
        obs: r.answers.filter((a) => a.bucket === "OBS").length,
        unanswered: r.answers.filter((a) => a.bucket == null || a.bucket === "SKIP").length,
      },
      criticalFails: r.answers.filter((a) => a.bucket === "IMPROVE" && a.question.critical).length,
      movement: moved
        ? { fixed: moved.fixed.length, stillWrong: moved.stillWrong.length, fresh: moved.fresh.length }
        : null,
    };
  });

  await audit({
    actorId: who.viewer.id,
    action: "export.inspections",
    metadata: { rows: out.length, filters: describeFilters(filters) },
  });
  return csv(inspectionsCsv(out, url.origin), filename(["inspections", named(rows)], on));
});
