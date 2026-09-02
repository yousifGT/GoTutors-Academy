import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageTemplate } from "@/lib/access";
import {
  ChecklistInput,
  countOf,
  diffChecklists,
  normalise,
  planSave,
  questionFromDb,
  questionRow,
  type Checklist,
} from "@/lib/checklist";

const QUESTION_FIELDS = {
  id: true,
  text: true,
  type: true,
  order: true,
  options: true,
  minVal: true,
  maxVal: true,
  unit: true,
  scored: true,
  requireNote: true,
  critical: true,
  photoExempt: true,
  allowNA: true,
  whoField: true,
  guide: true,
  dos: true,
  donts: true,
  sizeGuide: true,
  minBySize: true,
  tallyKey: true,
} as const;

/** The live checklist, in the order an inspector works through it. */
export const GET = withRoute(async () => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const template = await prisma.template.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    include: {
      sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
    },
  });
  if (!template)
    return NextResponse.json({ error: "No active checklist. Run: npm run db:seed" }, { status: 404 });

  return NextResponse.json(template);
});

const SaveSchema = z.object({
  /**
   * The version the editor loaded. Two people editing 101 questions at once
   * would otherwise finish with whichever of them pressed save last, and the
   * other's work gone without either of them being told.
   */
  baseVersion: z.number().int().min(1),
  checklist: ChecklistInput,
});

/**
 * Replace the checklist.
 *
 * Either in place or as a new version — see `planSave` in `@/lib/checklist` for
 * which and why. The whole document is sent and the whole document is written:
 * a field-by-field patch API over 101 questions would need every id to stay
 * stable across a version copy, and they cannot, because a copy is new rows.
 *
 * Everything happens in one transaction. A half-written checklist is not a
 * checklist — an inspection started against a template holding three of its ten
 * sections would be scored against three of its ten sections, and be recorded
 * as though that were the standard.
 */
export const PUT = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageTemplate(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, SaveSchema);
  if (!parsed.ok) return parsed.response;
  const next = normalise(parsed.data.checklist);

  let outcome: {
    mode: "in-place" | "new-version";
    version: number;
    from: number;
    templateId: string;
    before: Checklist;
  };

  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const live = await tx.template.findFirst({
          where: { isActive: true },
          orderBy: { version: "desc" },
          select: {
            id: true,
            name: true,
            version: true,
            _count: { select: { inspections: true } },
            sections: { orderBy: { order: "asc" }, select: { title: true, questions: { orderBy: { order: "asc" }, select: QUESTION_FIELDS } } },
          },
        });
        if (!live) throw new NoChecklist();
        if (live.version !== parsed.data.baseVersion) throw new Stale(live.version);

        const before: Checklist = {
          sections: live.sections.map((s) => ({ title: s.title, questions: s.questions.map(questionFromDb) })),
        };

        const highest = await tx.template.aggregate({ where: { name: live.name }, _max: { version: true } });
        const plan = planSave({
          liveVersion: live.version,
          highestVersion: highest._max.version ?? live.version,
          inspectionCount: live._count.inspections,
        });

        let templateId = live.id;
        if (plan.mode === "in-place") {
          // Nothing has been inspected against this version, so nothing points
          // at its questions and the cascade is safe. An inspection started in
          // the gap between the count and here makes that untrue: the foreign
          // key refuses the delete, the whole transaction rolls back, and the
          // save has to be retried — by which time the count says one, and it
          // becomes a published version instead. Correct, but only if the
          // person is told that rather than shown "internal server error".
          try {
            await tx.section.deleteMany({ where: { templateId: live.id } });
          } catch (e) {
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              (e.code === "P2003" || e.code === "P2014")
            )
              throw new RaceLost();
            throw e;
          }
        } else {
          const created = await tx.template.create({
            data: { name: live.name, version: plan.version, isActive: true },
            select: { id: true },
          });
          templateId = created.id;
          // Exactly one version is live. Everything else, including the one
          // just replaced, is history.
          await tx.template.updateMany({
            where: { name: live.name, id: { not: created.id } },
            data: { isActive: false },
          });
        }

        for (const [order, section] of next.sections.entries()) {
          await tx.section.create({
            data: {
              templateId,
              title: section.title,
              order,
              questions: { create: section.questions.map((q, i) => questionRow(q, i)) },
            },
          });
        }

        return { mode: plan.mode, version: plan.version, from: live.version, templateId, before };
      },
      // Fifteen sections and a hundred questions is fifteen round trips plus
      // their inserts; the 5s default is tight enough to fail on a slow
      // database for no good reason.
      { timeout: 30_000 }
    );
  } catch (e) {
    if (e instanceof NoChecklist)
      return NextResponse.json({ error: "There is no checklist to edit yet. Run: npm run db:seed" }, { status: 409 });
    if (e instanceof RaceLost)
      return NextResponse.json(
        {
          error:
            "An inspection was started against this checklist while you were saving, so it can no longer be changed where it stands. Save again and it will be published as a new version instead.",
        },
        { status: 409 }
      );
    if (e instanceof Stale)
      return NextResponse.json(
        {
          error: `The checklist moved on to v${e.version} while you were editing — someone else published a change. Reload and re-apply yours.`,
        },
        { status: 409 }
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Someone else published a new version at the same moment. Reload and try again." },
        { status: 409 }
      );
    throw e;
  }

  const counts = countOf(next);
  const changes = diffChecklists(outcome.before, next);
  await audit({
    actorId: who.viewer.id,
    action: outcome.mode === "new-version" ? "template.publish" : "template.update",
    target: outcome.templateId,
    metadata: {
      version: outcome.version,
      from: outcome.from,
      sections: counts.sections,
      questions: counts.questions,
      critical: counts.critical,
      added: changes.added,
      removed: changes.removed,
      edited: changes.edited,
      ...(changes.sectionsAdded.length ? { sectionsAdded: changes.sectionsAdded.join(", ") } : {}),
      ...(changes.sectionsRemoved.length ? { sectionsRemoved: changes.sectionsRemoved.join(", ") } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    mode: outcome.mode,
    version: outcome.version,
    templateId: outcome.templateId,
    ...counts,
    changes,
  });
});

class NoChecklist extends Error {}
class RaceLost extends Error {}
class Stale extends Error {
  constructor(readonly version: number) {
    super("stale");
  }
}
