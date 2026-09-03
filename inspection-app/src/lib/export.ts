import { toCsv, type Cell } from "@/lib/csv";

/**
 * The two spreadsheets.
 *
 * One row per inspection for "how are the centres doing", one row per answer
 * for "which questions keep failing". Both are the same data the screens
 * already show, read through the same filters — an export that covers a
 * different set from the page it was taken from is worse than none, because
 * nobody can tell which of the two is wrong.
 *
 * Assembling the rows is the route's job; this file only decides what the
 * columns are and what each one says. Keeping it free of Prisma is what makes
 * the column list testable.
 */

export const RESULT_LABEL: Record<string, string> = {
  WELL: "Done well",
  IMPROVE: "To improve",
  OBS: "Observation",
  SKIP: "Not answered",
};

export function resultLabel(bucket: string | null | undefined): string {
  return RESULT_LABEL[bucket ?? "SKIP"] ?? "Not answered";
}

/** Whole minutes: an inspection lasting 74 minutes is not usefully 74.3. */
export function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

const yesNo = (v: boolean) => (v ? "Yes" : "No");
const day = (d: Date) => d.toISOString().slice(0, 10);

export interface ExportInspection {
  id: string;
  date: Date;
  centre: string;
  size: string;
  inspector: string;
  status: string;
  scorePct: number | null;
  verdict: string | null;
  activeMs: number;
  checklistVersion: number;
  debriefName: string | null;
  debriefRole: string | null;
  targets: string | null;
  counts: { well: number; improve: number; obs: number; unanswered: number };
  criticalFails: number;
  /** Against the visit before it, whatever the export's date range. Null on a centre's first visit. */
  movement: { fixed: number; stillWrong: number; fresh: number } | null;
}

const INSPECTION_HEADERS = [
  "Inspection ID",
  "Date",
  "Centre",
  "Size",
  "Inspector",
  "Status",
  "Score %",
  "Verdict",
  "Done well",
  "To improve",
  "Observations",
  "Not answered",
  "Critical failures",
  "Put right since last visit",
  "Still not fixed",
  "New this visit",
  "Active minutes",
  "Checklist version",
  "Debrief with",
  "Debrief role",
  "Targets agreed",
  "Report",
];

export function inspectionsCsv(rows: ExportInspection[], origin: string): string {
  return toCsv(
    INSPECTION_HEADERS,
    rows.map((r): Cell[] => [
      r.id,
      day(r.date),
      r.centre,
      r.size,
      r.inspector,
      r.status,
      r.scorePct,
      r.verdict,
      r.counts.well,
      r.counts.improve,
      r.counts.obs,
      r.counts.unanswered,
      r.criticalFails,
      // Blank rather than zero on a centre's first visit: nothing was put right,
      // and nothing failed to be — there was nothing to compare against, and a
      // column of zeros would read as a run of visits that changed nothing.
      r.movement?.fixed ?? null,
      r.movement?.stillWrong ?? null,
      r.movement?.fresh ?? null,
      minutes(r.activeMs),
      r.checklistVersion,
      r.debriefName,
      r.debriefRole,
      r.targets,
      `${origin}/inspections/${r.id}/report`,
    ])
  );
}

export interface ExportAnswer {
  inspectionId: string;
  date: Date;
  centre: string;
  inspector: string;
  section: string;
  question: string;
  type: string;
  critical: boolean;
  answer: string;
  bucket: string | null;
  scoreFraction: number | null;
  /** Flagged at this centre's previous visit and flagged again here. */
  repeat: boolean;
  notes: string;
  photos: number;
}

const ANSWER_HEADERS = [
  "Inspection ID",
  "Date",
  "Centre",
  "Inspector",
  "Section",
  "Question",
  "Type",
  "Critical",
  "Answer",
  "Result",
  "Score fraction",
  "Not fixed since last visit",
  "Notes",
  "Photos",
];

export function answersCsv(rows: ExportAnswer[]): string {
  return toCsv(
    ANSWER_HEADERS,
    rows.map((r): Cell[] => [
      r.inspectionId,
      day(r.date),
      r.centre,
      r.inspector,
      r.section,
      r.question,
      r.type,
      yesNo(r.critical),
      r.answer,
      resultLabel(r.bucket),
      r.scoreFraction,
      yesNo(r.repeat),
      r.notes,
      r.photos,
    ])
  );
}

/**
 * The notes on one answer, as one cell.
 *
 * A question can carry several notes, each tagged with the tutor it is about.
 * One row per note would repeat the whole answer beside each and break every
 * count somebody does on the file; joining them with a line break keeps one row
 * per answer, and the CSV quoting keeps the columns aligned.
 */
export function joinNotes(entries: { who: string | null; note: string | null }[]): string {
  return entries
    .map((e) => {
      const note = e.note?.trim();
      if (!note) return null;
      return e.who?.trim() ? `${e.who.trim()}: ${note}` : note;
    })
    .filter((s): s is string => !!s)
    .join("\n");
}
