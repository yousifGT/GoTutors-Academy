/**
 * The checklist, as something that can be edited.
 *
 * Until now the 101 questions arrived once from `data/gotutors-seed.json` and
 * could never move: `Answer.questionId` is a real foreign key, so deleting or
 * replacing a question that has been answered is refused by the database. That
 * is the right constraint — an answer must keep pointing at the question it was
 * an answer to — but it made the checklist immovable rather than merely
 * careful.
 *
 * The way out is the one the schema was already built for: `Template.version`.
 * A version that no inspection has used yet is still a draft and is edited in
 * place. The moment one inspection has been run against it, that version is a
 * historical record, and the next edit copies the whole checklist to `version +
 * 1` and edits the copy. Recorded inspections keep pointing at the version they
 * were actually carried out under, so their reports keep rendering exactly as
 * they were; drafts in progress finish on the checklist their inspector
 * started with, rather than having questions appear and vanish under them.
 *
 * Versions therefore only climb when the checklist has been *used* since the
 * last edit. Three corrections in a row on the morning it is written stay v1.
 *
 * This module holds the parts with no database in them — the shape, what counts
 * as a valid question, and which of the two save modes applies — so they can be
 * tested directly and shared with `prisma/seed.ts`. Deliberately free of `@/`
 * imports for that reason: the seed runs under tsx without path aliases.
 */
import { z } from "zod";
import { Prisma, type InspectionQuestionType } from "@prisma/client";

export const QUESTION_TYPES = ["rating", "yesno", "scale", "number", "choice"] as const;
export type ChecklistQuestionType = (typeof QUESTION_TYPES)[number];

export const SIZES = ["small", "medium", "large"] as const;
export type ChecklistSize = (typeof SIZES)[number];

/**
 * The running counters on the inspector's screen. Restricted to the two the
 * tally bar has labels and directions for ("more is better" / "fewer is
 * better"): a third key would render as a counter with no explanation, which is
 * worse than not offering it. Adding one is a code change in `tally-bar.tsx`
 * and a line here.
 */
export const TALLY_KEYS = ["standups", "distractions"] as const;
export type TallyKey = (typeof TALLY_KEYS)[number];

export const TYPE_LABEL: Record<ChecklistQuestionType, string> = {
  rating: "Pass / Improve / Fail",
  yesno: "Yes / No",
  scale: "Scale",
  number: "Number",
  choice: "Multiple choice",
};

/** Limits. Generous against the real checklist (10 sections, 101 questions). */
export const LIMITS = {
  sections: 60,
  questionsPerSection: 200,
  questions: 600,
  options: 20,
  bullets: 20,
} as const;

export interface ChecklistQuestion {
  text: string;
  type: ChecklistQuestionType;
  options: string[] | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  scored: boolean;
  requireNote: boolean;
  critical: boolean;
  photoExempt: boolean;
  allowNA: boolean;
  whoField: boolean;
  guide: string | null;
  dos: string[] | null;
  donts: string[] | null;
  sizeGuide: Partial<Record<ChecklistSize, { text: string }>> | null;
  minBySize: Partial<Record<ChecklistSize, number>> | null;
  tally: TallyKey | null;
}

export interface ChecklistSection {
  title: string;
  questions: ChecklistQuestion[];
}

export interface Checklist {
  sections: ChecklistSection[];
}

const zText = z.string().trim().min(1).max(500);
const zBullets = z.array(z.string().trim().max(300)).max(LIMITS.bullets);
const zSizeMap = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ small: inner.optional(), medium: inner.optional(), large: inner.optional() }).partial();

/**
 * What the editor may send. Lenient about what is absent — a rating question
 * carries none of the number or choice fields — and strict about what is
 * present. `normalise` afterwards is what strips fields that do not apply to
 * the type, so a question can never carry a `minBySize` target nothing reads.
 */
export const QuestionInput = z.object({
  text: zText,
  type: z.enum(QUESTION_TYPES).default("rating"),
  options: z.array(z.string().trim().max(200)).max(LIMITS.options).nullish(),
  min: z.number().int().min(0).max(99).nullish(),
  max: z.number().int().min(1).max(100).nullish(),
  unit: z.string().trim().max(60).nullish(),
  scored: z.boolean().default(false),
  requireNote: z.boolean().default(false),
  critical: z.boolean().default(false),
  photoExempt: z.boolean().default(false),
  allowNA: z.boolean().default(false),
  whoField: z.boolean().default(false),
  guide: z.string().trim().max(2000).nullish(),
  dos: zBullets.nullish(),
  donts: zBullets.nullish(),
  sizeGuide: zSizeMap(z.object({ text: z.string().trim().max(1000) })).nullish(),
  minBySize: zSizeMap(z.number().int().min(0).max(100000)).nullish(),
  tally: z.enum(TALLY_KEYS).nullish(),
});

export const SectionInput = z.object({
  title: z.string().trim().min(1).max(200),
  questions: z.array(QuestionInput).min(1).max(LIMITS.questionsPerSection),
});

export const ChecklistInput = z
  .object({ sections: z.array(SectionInput).min(1).max(LIMITS.sections) })
  .superRefine((doc, ctx) => {
    let total = 0;
    // A question's wording is its identity across versions: `previouslyFlagged`
    // matches this visit's answers to the last visit's on text alone. Two
    // questions worded identically would be treated as the same question by
    // that comparison, and "still not fixed" would be reported against whichever
    // of them the last inspection happened to flag.
    const seen = new Set<string>();
    doc.sections.forEach((section, si) => {
      total += section.questions.length;
      section.questions.forEach((q, qi) => {
        const at = ["sections", si, "questions", qi] as const;
        const fail = (path: string, message: string) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...at, path], message });

        const wording = q.text.toLowerCase();
        if (seen.has(wording))
          fail(
            "text",
            "Another question is worded the same. A repeat finding is matched to the last visit by wording, so two identical questions would be read as one — say which is which."
          );
        seen.add(wording);

        if (q.type === "choice") {
          const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
          // One option is not a choice, and an unanswerable question blocks the
          // whole inspection it appears in.
          if (options.length < 2) fail("options", "A multiple choice needs at least two options.");
          if (new Set(options).size !== options.length) fail("options", "Options must be different from each other.");
        }
        if (q.type === "scale") {
          const min = q.min ?? 1;
          const max = q.max ?? 5;
          // itemScore divides by (max - min); equal bounds is a division by zero
          // and an inverted one scores backwards.
          if (max <= min) fail("max", "The top of the scale must be above the bottom.");
        }
      });
    });
    if (total > LIMITS.questions)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sections"],
        message: `A checklist may hold ${LIMITS.questions} questions; this one has ${total}.`,
      });
    if (total === 0)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "A checklist needs at least one question." });
  });

export type ChecklistInputShape = z.input<typeof ChecklistInput>;

function bullets(v: string[] | null | undefined): string[] | null {
  const kept = (v ?? []).map((s) => s.trim()).filter(Boolean);
  return kept.length ? kept : null;
}

function sizeText(
  v: Partial<Record<ChecklistSize, { text: string }>> | null | undefined
): Partial<Record<ChecklistSize, { text: string }>> | null {
  const out: Partial<Record<ChecklistSize, { text: string }>> = {};
  for (const size of SIZES) {
    const text = v?.[size]?.text?.trim();
    if (text) out[size] = { text };
  }
  return Object.keys(out).length ? out : null;
}

function sizeNumbers(
  v: Partial<Record<ChecklistSize, number>> | null | undefined
): Partial<Record<ChecklistSize, number>> | null {
  const out: Partial<Record<ChecklistSize, number>> = {};
  for (const size of SIZES) {
    const n = v?.[size];
    if (typeof n === "number" && Number.isFinite(n)) out[size] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Reduce a question to only the fields its type actually uses.
 *
 * The rules in `core/inspection-core.js` read `options` on a choice, `min`/`max`
 * on a scale and `minBySize` on a number, and ignore them everywhere else. A
 * stored field nothing reads is a trap: it survives a type change, looks
 * meaningful in the database, and quietly starts being read again if the
 * question is later switched back. Strip it at the door instead.
 */
export function normaliseQuestion(input: z.infer<typeof QuestionInput>): ChecklistQuestion {
  const type = input.type;
  const choice = type === "choice";
  const scale = type === "scale";
  const number = type === "number";
  const critical = input.critical;

  return {
    text: input.text,
    type,
    options: choice ? Array.from(new Set((input.options ?? []).map((o) => o.trim()).filter(Boolean))) : null,
    min: scale ? (input.min ?? 1) : null,
    max: scale ? (input.max ?? 5) : null,
    unit: number ? (input.unit?.trim() || null) : null,
    // Only a multiple choice can be "scored, best option first"; on any other
    // type the flag reads as though it changed the score, and it does not.
    scored: choice ? input.scored : false,
    requireNote: input.requireNote,
    critical,
    // photoExempt means "this critical item is evidenced in writing instead".
    // With nothing critical to be exempt from, it is noise.
    photoExempt: critical ? input.photoExempt : false,
    allowNA: input.allowNA,
    whoField: input.whoField,
    guide: input.guide?.trim() || null,
    dos: bullets(input.dos),
    donts: bullets(input.donts),
    sizeGuide: sizeText(input.sizeGuide),
    minBySize: number ? sizeNumbers(input.minBySize) : null,
    // A tally is a counter on the session bar, which increments a number.
    tally: number ? (input.tally ?? null) : null,
  };
}

export function normalise(doc: z.infer<typeof ChecklistInput>): Checklist {
  return {
    sections: doc.sections.map((s) => ({ title: s.title, questions: s.questions.map(normaliseQuestion) })),
  };
}

export const TYPE_TO_DB: Record<ChecklistQuestionType, InspectionQuestionType> = {
  rating: "RATING",
  yesno: "YESNO",
  scale: "SCALE",
  number: "NUMBER",
  choice: "CHOICE",
};

export const TYPE_FROM_DB: Record<InspectionQuestionType, ChecklistQuestionType> = {
  RATING: "rating",
  YESNO: "yesno",
  SCALE: "scale",
  NUMBER: "number",
  CHOICE: "choice",
};

/**
 * A nullable Json column. Prisma needs the explicit `Prisma.DbNull` sentinel to
 * write a SQL NULL — a plain `null` writes the JSON value `null` instead.
 */
function json(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

/** One question as a Prisma create-input, for nesting under a section. */
export function questionRow(q: ChecklistQuestion, order: number) {
  return {
    text: q.text,
    type: TYPE_TO_DB[q.type],
    order,
    options: json(q.options),
    minVal: q.min,
    maxVal: q.max,
    unit: q.unit,
    scored: q.scored,
    requireNote: q.requireNote,
    critical: q.critical,
    photoExempt: q.photoExempt,
    allowNA: q.allowNA,
    whoField: q.whoField,
    guide: q.guide,
    dos: json(q.dos),
    donts: json(q.donts),
    sizeGuide: json(q.sizeGuide),
    minBySize: json(q.minBySize),
    tallyKey: q.tally,
  };
}

/** A stored question read back into the editable shape. */
export function questionFromDb(row: {
  text: string;
  type: InspectionQuestionType;
  options: unknown;
  minVal: number | null;
  maxVal: number | null;
  unit: string | null;
  scored: boolean;
  requireNote: boolean;
  critical: boolean;
  photoExempt: boolean;
  allowNA: boolean;
  whoField: boolean;
  guide: string | null;
  dos: unknown;
  donts: unknown;
  sizeGuide: unknown;
  minBySize: unknown;
  tallyKey: string | null;
}): ChecklistQuestion {
  return {
    text: row.text,
    type: TYPE_FROM_DB[row.type],
    options: (row.options as string[] | null) ?? null,
    min: row.minVal,
    max: row.maxVal,
    unit: row.unit,
    scored: row.scored,
    requireNote: row.requireNote,
    critical: row.critical,
    photoExempt: row.photoExempt,
    allowNA: row.allowNA,
    whoField: row.whoField,
    guide: row.guide,
    dos: (row.dos as string[] | null) ?? null,
    donts: (row.donts as string[] | null) ?? null,
    sizeGuide: (row.sizeGuide as ChecklistQuestion["sizeGuide"]) ?? null,
    minBySize: (row.minBySize as ChecklistQuestion["minBySize"]) ?? null,
    tally: (TALLY_KEYS as readonly string[]).includes(row.tallyKey ?? "") ? (row.tallyKey as TallyKey) : null,
  };
}

export type SavePlan =
  | { mode: "in-place"; version: number }
  | { mode: "new-version"; version: number; from: number };

/**
 * Which of the two saves applies.
 *
 * `inspectionCount` is every inspection against the live version, drafts
 * included — a draft has answers with foreign keys just as a submitted one
 * does, and an inspector halfway through a visit should not have the questions
 * change under them either.
 *
 * The new version is `highest + 1` rather than `live + 1`: the seed can leave
 * an inactive higher version behind, and `@@unique([name, version])` would
 * refuse a collision.
 */
export function planSave(opts: { liveVersion: number; highestVersion: number; inspectionCount: number }): SavePlan {
  if (opts.inspectionCount === 0) return { mode: "in-place", version: opts.liveVersion };
  return { mode: "new-version", version: Math.max(opts.liveVersion, opts.highestVersion) + 1, from: opts.liveVersion };
}

/** Section and question counts, for the editor's summary line. */
export function countOf(doc: Checklist): { sections: number; questions: number; critical: number } {
  return {
    sections: doc.sections.length,
    questions: doc.sections.reduce((n, s) => n + s.questions.length, 0),
    critical: doc.sections.reduce((n, s) => n + s.questions.filter((q) => q.critical).length, 0),
  };
}

/** A blank question, as the editor adds one. */
export function blankQuestion(): ChecklistQuestion {
  return {
    text: "",
    type: "rating",
    options: null,
    min: null,
    max: null,
    unit: null,
    scored: false,
    requireNote: false,
    critical: false,
    photoExempt: false,
    allowNA: false,
    whoField: false,
    guide: null,
    dos: null,
    donts: null,
    sizeGuide: null,
    minBySize: null,
    tally: null,
  };
}

export interface ChecklistDiff {
  sectionsAdded: string[];
  sectionsRemoved: string[];
  added: number;
  removed: number;
  edited: number;
}

/**
 * What changed between two checklists, for the audit log.
 *
 * Questions are matched on their text, because a new version is a fresh copy
 * and shares no ids with the one before it. That has one honest limitation: a
 * question whose *wording* was rewritten reads as one removed and one added
 * rather than as an edit. Wording is the part of a question an inspector
 * actually answers, so treating a rewrite as a replacement is closer to the
 * truth than pretending it is the same question.
 *
 * Comparison is on a key-sorted serialisation, not a plain `JSON.stringify`.
 * The stored side comes back out of a jsonb column in Postgres's own key order
 * — `{large, small}` where this file writes `{small, large}` — so comparing the
 * raw text reported two questions as edited on a version copy that had changed
 * nothing about them. An audit line saying the scoring standard moved when it
 * did not is worse than no line at all.
 */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`;
}

export function diffChecklists(before: Checklist, after: Checklist): ChecklistDiff {
  const index = (doc: Checklist) => {
    const map = new Map<string, ChecklistQuestion>();
    for (const s of doc.sections) for (const q of s.questions) map.set(q.text, q);
    return map;
  };
  const was = index(before);
  const now = index(after);

  let added = 0;
  let edited = 0;
  for (const [text, q] of now) {
    const old = was.get(text);
    if (!old) added++;
    else if (stable(old) !== stable(q)) edited++;
  }
  const removed = Array.from(was.keys()).filter((t) => !now.has(t)).length;

  const titles = (doc: Checklist) => new Set(doc.sections.map((s) => s.title));
  const beforeTitles = titles(before);
  const afterTitles = titles(after);

  return {
    sectionsAdded: Array.from(afterTitles).filter((t) => !beforeTitles.has(t)),
    sectionsRemoved: Array.from(beforeTitles).filter((t) => !afterTitles.has(t)),
    added,
    removed,
    edited,
  };
}
