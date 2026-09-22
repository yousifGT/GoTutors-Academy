import type { SchemeQuestion, WorkedExample } from "./types";
import { selectExamples, spreadByScore } from "./examples";

/**
 * Everything the reader is told, built as plain text so it can be diffed,
 * reviewed and tested without calling anything.
 *
 * Two things are deliberately NOT in here: the total available marks per
 * question is stated but never relied on (scoring.ts takes the denominator from
 * the scheme), and nothing asks for a grade or a prediction. The model reads
 * handwriting and applies a mark scheme; the banding is ours.
 */

export const SYSTEM_PROMPT = [
  "You are an experienced examiner marking a photographed exam paper for a school-age student.",
  "",
  "You will be shown one or more photographs of a student's paper, and a mark scheme.",
  "Mark every question in the mark scheme, in the order it appears.",
  "",
  "Rules:",
  "1. Transcribe what the student actually wrote before you mark it. Put that in `transcript`, exactly as written, including their mistakes. Never tidy it up.",
  "2. If you cannot read an answer, or cannot find it on the page, set `legible` to false and `confidence` to 0. Do not guess a mark. A human will mark it instead.",
  "3. Award whole marks only, from 0 up to the marks available for that question.",
  "4. Mark the student's method as well as their answer, exactly as the mark scheme's guidance says. A right answer by a wrong method is not full marks unless the guidance says so.",
  "5. `confidence` is how sure you are of the MARK, from 0 to 1 — not how good the answer was. Faint handwriting, an ambiguous answer, or a question the mark scheme does not cover cleanly all mean low confidence.",
  "6. `comment` is addressed to the student, in the second person, and is one or two sentences. Say what earned the marks or what lost them. Never just repeat the correct answer.",
  "7. Worked examples, where given, show how this centre's tutors marked this exact question before. Follow them over your own instinct — they are the house standard.",
  "",
  "For the paper as a whole:",
  "- `strengths`: two or three specific things the student did well, naming questions. Not praise for its own sake.",
  "- `improvements`: two or three specific, actionable things to work on next. Name the skill, not the question number alone.",
  "- `overallComment`: two or three sentences to the student about how the paper went.",
  "- `unreadable`: true only if the photographs are too poor to mark at all.",
].join("\n");

/** The mark scheme, rendered for the model. */
export function renderScheme(questions: SchemeQuestion[]): string {
  if (questions.length === 0) return "This mark scheme has no questions.";
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const lines = [
        `Question ${q.label} (${q.marks} mark${q.marks === 1 ? "" : "s"})`,
        `Asked: ${q.prompt}`,
        `Expected answer: ${q.expectedAnswer}`,
      ];
      if (q.guidance?.trim()) lines.push(`Marking guidance: ${q.guidance.trim()}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Worked examples, grouped under the question they belong to. */
export function renderExamples(questions: SchemeQuestion[], pool: WorkedExample[], perQuestion?: number): string {
  const selected = selectExamples(pool, perQuestion);
  const blocks: string[] = [];

  for (const q of [...questions].sort((a, b) => a.order - b.order)) {
    const forQuestion = selected.get(q.id);
    if (!forQuestion?.length) continue;
    const spread = spreadByScore(forQuestion, forQuestion.length);
    const rendered = spread
      .map(
        (e) =>
          [
            `  Student wrote: ${e.studentAnswer}`,
            `  Marked: ${e.awarded}/${e.available}`,
            `  Examiner said: ${e.examinerComment}`,
          ].join("\n")
      )
      .join("\n  ---\n");
    blocks.push(`Question ${q.label} — how this was marked before:\n${rendered}`);
  }

  return blocks.join("\n\n");
}

/**
 * The full text block that accompanies the photographs.
 *
 * Order matters for caching as well as for reading: the scheme and its examples
 * are stable across every paper marked against it, so they go first and the
 * per-paper instruction goes last.
 */
export function buildUserText(opts: {
  schemeTitle: string;
  subject: string;
  level?: string | null;
  questions: SchemeQuestion[];
  examples: WorkedExample[];
  pageCount: number;
  examplesPerQuestion?: number;
}): string {
  const parts = [
    `Mark scheme: ${opts.schemeTitle}`,
    `Subject: ${opts.subject}${opts.level ? ` (${opts.level})` : ""}`,
    "",
    renderScheme(opts.questions),
  ];

  const examples = renderExamples(opts.questions, opts.examples, opts.examplesPerQuestion);
  if (examples) {
    parts.push("", "Worked examples from previously marked papers:", "", examples);
  }

  parts.push(
    "",
    `The ${opts.pageCount} image${opts.pageCount === 1 ? "" : "s"} above ${
      opts.pageCount === 1 ? "is" : "are"
    } the student's paper, in page order. Mark every question in the mark scheme.`
  );

  return parts.join("\n");
}
