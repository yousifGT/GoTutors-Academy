import type { Bucket } from "@prisma/client";
import { answerText } from "@/lib/core";
import { isRepeat, previouslyFlaggedSet, type PreviouslyFlagged } from "@/lib/repeat";
import { scoreDbInspection, toCoreItem, type AnswerRow, type QuestionRow, type SectionRow } from "@/lib/score";

/**
 * The report, assembled once.
 *
 * The screen and the PDF both read this, so the document emailed to a centre
 * cannot say something different from the one the inspector is looking at.
 */

export interface ReportEntry {
  who: string | null;
  note: string | null;
  photos: string[];
}

export interface ReportRow {
  section: string;
  question: string;
  answer: string;
  bucket: Bucket;
  critical: boolean;
  /** Flagged at the previous visit and flagged again. */
  repeat: boolean;
  entries: ReportEntry[];
}

export interface Report {
  centre: string;
  inspector: string;
  date: Date;
  size: "SMALL" | "MEDIUM" | "LARGE";
  status: "DRAFT" | "SUBMITTED";
  checklistVersion: number;
  activeMs: number;
  pct: number;
  verdict: string;
  verdictColor: string;
  counts: { well: number; improve: number; obs: number; unanswered: number };
  criticalFails: string[];
  targets: string | null;
  debrief: {
    name: string | null;
    role: string | null;
    notes: string | null;
    feedback: string | null;
    email: string | null;
    signatureUrl: string | null;
  };
  /** Grouped by what the reader must do about them, not by walking order. */
  groups: { key: Bucket; title: string; rows: ReportRow[] }[];
  /**
   * Findings the centre was told about last time and has not fixed. Listed
   * ahead of everything else: a second failure of the same thing says the
   * debrief was heard and nothing was done.
   */
  repeats: ReportRow[];
}

/** The shape `buildReport` needs — a Prisma inspection with its template and answers. */
export interface ReportSource {
  centre: { name: string };
  inspector: { name: string };
  date: Date;
  size: "SMALL" | "MEDIUM" | "LARGE";
  status: "DRAFT" | "SUBMITTED";
  activeMs: number;
  scorePct: number | null;
  verdict: string | null;
  targets: string | null;
  debriefName: string | null;
  debriefRole: string | null;
  debriefNotes: string | null;
  debriefFeedback: string | null;
  debriefEmail: string | null;
  debriefSignatureUrl: string | null;
  template: { version: number; sections: { title: string; questions: QuestionRow[] }[] };
  answers: (AnswerRow & { entries: { note: string | null; who: string | null; photos: { url: string }[] }[] })[];
}

/** Matches inspection-core's verdictFor(), plus the critical override's word. */
export const VERDICT_COLOR: Record<string, string> = {
  Good: "#2f855a",
  Satisfactory: "#c07d10",
  "Needs attention": "#c0392b",
  "Serious finding": "#c0392b",
};

const GROUPS: { key: Bucket; title: string }[] = [
  { key: "IMPROVE", title: "To improve" },
  { key: "OBS", title: "Observations" },
  { key: "WELL", title: "Done well" },
];

/**
 * `previouslyFlagged` is required rather than defaulted, deliberately.
 *
 * It used to default to an empty set, and both documents that leave the
 * building — the PDF download and the copy attached to the centre head's email
 * — simply forgot to pass it. Neither failed; they quietly reported that
 * nothing had been left unfixed, while the same inspection on screen showed the
 * repeats. A default turned "we forgot" into "there were none", which for the
 * single most consequential line in the report is the worst way to be wrong.
 * Now it does not compile without an answer.
 */
export function buildReport(i: ReportSource, previouslyFlagged: PreviouslyFlagged): Report {
  const sections: SectionRow[] = i.template.sections.map((s) => ({ title: s.title, questions: s.questions }));
  const answers: AnswerRow[] = i.answers.map((a) => ({
    questionId: a.questionId,
    answer: a.answer,
    entries: a.entries,
  }));
  const score = scoreDbInspection(sections, answers, i.size);
  const byQuestion = new Map(i.answers.map((a) => [a.questionId, a]));

  const rows: ReportRow[] = sections.flatMap((s) =>
    s.questions.map((q) => {
      const stored = byQuestion.get(q.id);
      const bucket = score.answers.find((a) => a.questionId === q.id)!.bucket;
      return {
        section: s.title,
        question: q.text,
        answer: answerText(toCoreItem(q, stored)),
        bucket,
        critical: q.critical,
        repeat: isRepeat(q.text, bucket, previouslyFlagged),
        entries: (stored?.entries ?? [])
          .filter((e) => e.note?.trim() || e.who?.trim() || e.photos.length)
          .map((e) => ({ who: e.who, note: e.note, photos: e.photos.map((p) => p.url) })),
      };
    })
  );

  const pct = i.status === "SUBMITTED" && i.scorePct != null ? i.scorePct : score.pct;
  const verdict = i.status === "SUBMITTED" && i.verdict ? i.verdict : score.verdict.word;

  return {
    centre: i.centre.name,
    inspector: i.inspector.name,
    date: i.date,
    size: i.size,
    status: i.status,
    checklistVersion: i.template.version,
    activeMs: i.activeMs,
    // A submitted inspection reports the score recorded at submission; a draft
    // has none yet, so it reports what it currently stands at.
    pct,
    verdict,
    // The colour follows the word that is actually shown. Taking it from the
    // live score instead would print a stored verdict in the wrong colour if the
    // two ever diverged.
    verdictColor: VERDICT_COLOR[verdict] ?? score.verdict.color,
    counts: { well: score.well, improve: score.poor, obs: score.obs, unanswered: score.unanswered },
    criticalFails: score.criticalFails,
    targets: i.targets,
    debrief: {
      name: i.debriefName,
      role: i.debriefRole,
      notes: i.debriefNotes,
      feedback: i.debriefFeedback,
      email: i.debriefEmail,
      signatureUrl: i.debriefSignatureUrl,
    },
    groups: GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.bucket === g.key) })).filter(
      (g) => g.rows.length > 0
    ),
    repeats: rows.filter((r) => r.repeat),
  };
}

/** Everything a Prisma query must include for `buildReport` to work. */
export const reportInclude = {
  centre: { select: { name: true } },
  inspector: { select: { name: true } },
  template: {
    include: {
      sections: { orderBy: { order: "asc" as const }, include: { questions: { orderBy: { order: "asc" as const } } } },
    },
  },
  answers: { include: { entries: { orderBy: { order: "asc" as const }, include: { photos: true } } } },
};
