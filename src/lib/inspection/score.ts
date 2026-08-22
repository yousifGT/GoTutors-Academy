import type {
  CentreSize,
  InspectionBucket,
  InspectionQuestionType,
} from "@prisma/client";
import {
  bucketOf,
  itemScore,
  notesRequired,
  photoRequired,
  scoreInspection,
  type Bucket,
  type CoreItem,
  type CoreQuestionType,
  type CoreSection,
  type InspectionScore,
  type Size,
} from "./core";

/**
 * The bridge between database rows and the shared scoring rules.
 *
 * The core speaks lowercase strings ("rating", "small", "improve"); the database
 * uses Prisma enums. Everything crossing that line goes through here so the
 * mapping exists once.
 *
 * Centre size is a **required** argument throughout, not an optional one. A
 * number question carrying `minBySize` resolves its bucket from the size, and a
 * critical one can flip the whole verdict on size alone, so a bucket computed
 * without it is silently wrong. Making it required is what stops that happening.
 */

const TYPE_TO_CORE: Record<InspectionQuestionType, CoreQuestionType> = {
  RATING: "rating",
  YESNO: "yesno",
  SCALE: "scale",
  NUMBER: "number",
  CHOICE: "choice",
};

const TYPE_FROM_CORE: Record<CoreQuestionType, InspectionQuestionType> = {
  rating: "RATING",
  yesno: "YESNO",
  scale: "SCALE",
  number: "NUMBER",
  choice: "CHOICE",
};

const BUCKET_TO_DB: Record<Bucket, InspectionBucket> = {
  well: "WELL",
  improve: "IMPROVE",
  obs: "OBS",
  skip: "SKIP",
};

export function toCoreType(t: InspectionQuestionType): CoreQuestionType {
  return TYPE_TO_CORE[t];
}

export function toDbType(t: CoreQuestionType): InspectionQuestionType {
  return TYPE_FROM_CORE[t];
}

export function toCoreSize(size: CentreSize): Size {
  return size.toLowerCase() as Size;
}

export function toDbSize(size: Size): CentreSize | null {
  return size ? (size.toUpperCase() as CentreSize) : null;
}

export function toDbBucket(b: Bucket): InspectionBucket {
  return BUCKET_TO_DB[b];
}

/** The question fields the core reads. A Prisma row satisfies this as-is. */
export interface QuestionRow {
  id: string;
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
}

export interface AnswerRow {
  questionId: string;
  answer: string | null;
  entries: { note: string | null; who: string | null; photos: { url: string }[] }[];
}

function asStringArray(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

/** Build the shape the core expects from a question row and its answer, if any. */
export function toCoreItem(q: QuestionRow, answer?: AnswerRow): CoreItem {
  return {
    text: q.text,
    type: toCoreType(q.type),
    options: asStringArray(q.options),
    min: q.minVal,
    max: q.maxVal,
    unit: q.unit,
    scored: q.scored,
    requireNote: q.requireNote,
    critical: q.critical,
    photoExempt: q.photoExempt,
    allowNA: q.allowNA,
    whoField: q.whoField,
    guide: q.guide,
    dos: asStringArray(q.dos),
    donts: asStringArray(q.donts),
    sizeGuide: (q.sizeGuide ?? null) as CoreItem["sizeGuide"],
    minBySize: (q.minBySize ?? null) as CoreItem["minBySize"],
    tally: q.tallyKey,
    answer: answer?.answer ?? null,
    entries: (answer?.entries ?? []).map((e) => ({
      note: e.note ?? "",
      who: e.who ?? "",
      photos: e.photos.map((p) => p.url),
    })),
  };
}

export interface SectionRow {
  title: string;
  questions: QuestionRow[];
}

export function toCoreSections(sections: SectionRow[], answers: AnswerRow[]): CoreSection[] {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  return sections.map((s) => ({
    title: s.title,
    items: s.questions.map((q) => toCoreItem(q, byQuestion.get(q.id))),
  }));
}

/** What to persist on one answer row, alongside the headline score. */
export interface ScoredAnswer {
  questionId: string;
  questionText: string;
  answer: string | null;
  scoreFraction: number | null;
  bucket: InspectionBucket;
  /** The inspector still owes a written note on this one. */
  noteRequired: boolean;
  /** The inspector still owes photo evidence on this one. */
  photoRequired: boolean;
}

export interface ScoredInspection extends InspectionScore {
  answers: ScoredAnswer[];
  /** Questions answered in a way that demands a note, with none written yet. */
  missingNotes: string[];
  /** Failed critical questions that demand photo evidence, with none attached. */
  missingPhotos: string[];
  /** Critical questions left unanswered. */
  unansweredCritical: string[];
}

/**
 * Score a whole inspection from its database rows and work out what still
 * blocks submission. `size` is the size recorded on the inspection itself, not
 * the centre's default — an inspector may override it for a given visit.
 */
export function scoreDbInspection(
  sections: SectionRow[],
  answers: AnswerRow[],
  size: CentreSize
): ScoredInspection {
  const coreSize = toCoreSize(size);
  const coreSections = toCoreSections(sections, answers);
  const headline = scoreInspection(coreSections, coreSize);

  const scored: ScoredAnswer[] = [];
  const missingNotes: string[] = [];
  const missingPhotos: string[] = [];
  const unansweredCritical: string[] = [];

  sections.forEach((section, si) => {
    section.questions.forEach((q, qi) => {
      const item = coreSections[si].items[qi];
      const needsNote = notesRequired(item, coreSize);
      const needsPhoto = photoRequired(item, coreSize);
      const hasNote = item.entries.some((e) => e.note && e.note.trim());
      const hasPhoto = item.entries.some((e) => (e.photos?.length ?? 0) > 0);

      if (needsNote && !hasNote) missingNotes.push(q.text);
      if (needsPhoto && !hasPhoto) missingPhotos.push(q.text);
      if (q.critical && (item.answer === null || item.answer === "")) unansweredCritical.push(q.text);

      scored.push({
        questionId: q.id,
        questionText: q.text,
        answer: item.answer,
        scoreFraction: itemScore(item),
        bucket: toDbBucket(bucketOf(item, coreSize)),
        noteRequired: needsNote,
        photoRequired: needsPhoto,
      });
    });
  });

  return { ...headline, answers: scored, missingNotes, missingPhotos, unansweredCritical };
}

/** Whether an inspection is complete enough to submit. */
export function canSubmit(s: ScoredInspection): boolean {
  return (
    s.unanswered === 0 &&
    s.missingNotes.length === 0 &&
    s.missingPhotos.length === 0 &&
    s.unansweredCritical.length === 0
  );
}
