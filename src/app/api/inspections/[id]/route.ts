import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { canEditInspection, canViewInspection, inspectionAccess } from "@/lib/inspection/access";
import { scoreDbInspection, type AnswerRow, type SectionRow } from "@/lib/inspection/score";

type Ctx = { params: { id: string } };

const EntrySchema = z.object({
  note: z.string().max(4000).nullish(),
  who: z.string().max(120).nullish(),
  photos: z.array(z.string().url().max(2000)).max(12).optional(),
});

const AnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().max(200).nullable(),
  entries: z.array(EntrySchema).max(20).optional(),
});

const PatchSchema = z.object({
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]).optional(),
  /** Accumulated ACTIVE milliseconds, checkpointed by the client as it goes. */
  activeMs: z.number().int().min(0).max(86_400_000).optional(),
  targets: z.string().max(4000).nullish(),
  debriefRole: z.string().max(120).nullish(),
  debriefName: z.string().max(120).nullish(),
  debriefNotes: z.string().max(8000).nullish(),
  debriefFeedback: z.string().max(8000).nullish(),
  debriefEmail: z.string().email().max(320).nullish(),
  debriefSignatureUrl: z.string().url().max(2000).nullish(),
  answers: z.array(AnswerSchema).max(500).optional(),
});

const fullInclude = {
  centre: { select: { id: true, name: true, size: true } },
  inspector: { select: { id: true, name: true } },
  template: {
    include: {
      sections: { orderBy: { order: "asc" as const }, include: { questions: { orderBy: { order: "asc" as const } } } },
    },
  },
  answers: { include: { entries: { orderBy: { order: "asc" as const }, include: { photos: true } } } },
};

/** One inspection, with the checklist it was run against and its live score. */
export const GET = withRoute(async (_req: Request, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const inspection = await prisma.inspection.findUnique({ where: { id: params.id }, include: fullInclude });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });

  const viewer = { id: session.user.id, centreId: session.user.centreId };
  const access = await inspectionAccess(session.user.id);
  if (!canViewInspection(viewer, access, inspection))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sections: SectionRow[] = inspection.template.sections.map((s) => ({
    title: s.title,
    questions: s.questions,
  }));
  const answers: AnswerRow[] = inspection.answers.map((a) => ({
    questionId: a.questionId,
    answer: a.answer,
    entries: a.entries,
  }));

  return NextResponse.json({
    ...inspection,
    score: scoreDbInspection(sections, answers, inspection.size),
    editable: canEditInspection(viewer, access, inspection),
  });
});

/**
 * Autosave. The client sends whatever changed — a single answer, the running
 * clock, a debrief field — and the whole thing stays resumable: an inspection
 * interrupted mid-visit reopens with its answers, photos, debrief and paused
 * timer intact.
 *
 * Answers are replaced wholesale per question (entries and photos included),
 * which keeps the client simple: it owns the entry list for a question and
 * sends the current state of it.
 */
export const PATCH = withRoute(async (req: Request, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id },
    select: { id: true, inspectorId: true, centreId: true, status: true, templateId: true },
  });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });

  const viewer = { id: session.user.id, centreId: session.user.centreId };
  const access = await inspectionAccess(session.user.id);
  if (!canEditInspection(viewer, access, inspection))
    return NextResponse.json(
      { error: inspection.status === "SUBMITTED" ? "This inspection has been submitted" : "forbidden" },
      { status: 403 }
    );

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;
  const { answers, ...fields } = parsed.data;

  if (answers?.length) {
    // Every question must belong to the checklist this inspection was started
    // against — otherwise an answer could be smuggled in from another template.
    const valid = await prisma.inspectionQuestion.findMany({
      where: { id: { in: answers.map((a) => a.questionId) }, section: { templateId: inspection.templateId } },
      select: { id: true, text: true },
    });
    const byId = new Map(valid.map((q) => [q.id, q]));
    const unknown = answers.filter((a) => !byId.has(a.questionId)).map((a) => a.questionId);
    if (unknown.length)
      return NextResponse.json({ error: "Unknown question for this checklist", details: unknown }, { status: 400 });

    await prisma.$transaction(
      answers.map((a) =>
        prisma.inspectionAnswer.upsert({
          where: { inspectionId_questionId: { inspectionId: inspection.id, questionId: a.questionId } },
          create: {
            inspectionId: inspection.id,
            questionId: a.questionId,
            questionText: byId.get(a.questionId)!.text,
            answer: a.answer,
            entries: {
              create: (a.entries ?? []).map((e, i) => ({
                note: e.note ?? null,
                who: e.who ?? null,
                order: i,
                photos: { create: (e.photos ?? []).map((url) => ({ url })) },
              })),
            },
          },
          update: {
            answer: a.answer,
            // The client owns the entry list for a question; replace it wholesale
            // so a deleted note or photo actually disappears.
            entries: {
              deleteMany: {},
              create: (a.entries ?? []).map((e, i) => ({
                note: e.note ?? null,
                who: e.who ?? null,
                order: i,
                photos: { create: (e.photos ?? []).map((url) => ({ url })) },
              })),
            },
          },
        })
      )
    );
  }

  const hasFields = Object.keys(fields).length > 0;
  if (hasFields) {
    await prisma.inspection.update({ where: { id: inspection.id }, data: fields });
  }

  return NextResponse.json({ ok: true, saved: answers?.length ?? 0 });
});

/** Discard a draft. A submitted inspection is a record and cannot be deleted here. */
export const DELETE = withRoute(async (_req: Request, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id },
    select: { id: true, inspectorId: true, centreId: true, status: true },
  });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });

  const viewer = { id: session.user.id, centreId: session.user.centreId };
  const access = await inspectionAccess(session.user.id);
  if (!canEditInspection(viewer, access, inspection))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.inspection.delete({ where: { id: inspection.id } });
  await audit({ actorId: session.user.id, action: "inspection.discard", target: inspection.id });

  return NextResponse.json({ ok: true });
});
