import type { CheckedMark } from "./types";
import { percentageOf } from "./scoring";

/**
 * The "how did they do" half of a marked paper.
 *
 * A number on its own tells a ten-year-old nothing. Every report therefore
 * carries a band, a plain sentence, and two lists — what went well, what to work
 * on. When the model gives us those lists we use them; when it doesn't, we build
 * them from the marks themselves rather than showing a report with the feedback
 * section empty.
 */

export type Band = {
  key: "excellent" | "strong" | "secure" | "developing" | "support";
  label: string;
  /** A Tailwind class pair, so the chip matches the rest of the app. */
  tone: string;
  summary: string;
};

const BANDS: { min: number; band: Band }[] = [
  {
    min: 90,
    band: { key: "excellent", label: "Excellent", tone: "bg-teal/15 text-teal", summary: "Confident across the whole paper." },
  },
  {
    min: 75,
    band: { key: "strong", label: "Strong", tone: "bg-sky/15 text-sky", summary: "Secure, with a few slips to tidy up." },
  },
  {
    min: 60,
    band: { key: "secure", label: "Secure", tone: "bg-amber/15 text-amber", summary: "The core is there; the harder questions need work." },
  },
  {
    min: 40,
    band: { key: "developing", label: "Developing", tone: "bg-coral/15 text-coral", summary: "Some of it has landed. Worth going back over the basics." },
  },
  {
    min: 0,
    band: { key: "support", label: "Needs support", tone: "bg-plum/15 text-plum", summary: "This topic needs teaching again before the next test." },
  },
];

export function bandFor(percentage: number): Band {
  return (BANDS.find((b) => percentage >= b.min) ?? BANDS[BANDS.length - 1]).band;
}

/**
 * Strengths and improvements derived from the marks alone.
 *
 * Used when the model returns none, and as the floor under a thin response: a
 * report that says "you did well" and nothing else is worse than useless to a
 * tutor sitting with the child.
 */
export function feedbackFromMarks(marks: CheckedMark[]): { strengths: string[]; improvements: string[] } {
  const scored = marks.filter((m) => m.available > 0);
  const full = scored.filter((m) => m.awarded === m.available);
  const none = scored.filter((m) => m.awarded === 0);
  const partial = scored.filter((m) => m.awarded > 0 && m.awarded < m.available);

  const strengths: string[] = [];
  if (full.length > 0) {
    strengths.push(`Full marks on ${listLabels(full)} — ${full.length} of ${scored.length} questions completely right.`);
  }
  if (partial.length > 0 && none.length === 0) {
    strengths.push("Every question was attempted, and each one earned something.");
  }

  const improvements: string[] = [];
  if (none.length > 0) {
    improvements.push(`No marks yet on ${listLabels(none)}. Start there — those are the biggest gains available.`);
  }
  if (partial.length > 0) {
    improvements.push(`Part marks on ${listLabels(partial)}. The method is right; the finishing is what's costing marks.`);
  }
  if (improvements.length === 0 && scored.length > 0) {
    improvements.push("Nothing dropped on this paper. Move on to harder questions on the same topic.");
  }

  return { strengths, improvements };
}

/** "Q1, Q3 and Q7", capped so a long list stays a sentence. */
export function listLabels(marks: CheckedMark[], max = 4): string {
  const labels = marks.map((m) => `Q${m.label}`);
  if (labels.length <= max) {
    if (labels.length <= 1) return labels[0] ?? "";
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }
  return `${labels.slice(0, max).join(", ")} and ${labels.length - max} more`;
}

/**
 * One sentence a tutor can read out: the score, the band, and what it means.
 */
export function summarise(awarded: number, available: number): string {
  const pct = percentageOf(awarded, available);
  const band = bandFor(pct);
  return `${awarded} out of ${available} (${pct}%) — ${band.label.toLowerCase()}. ${band.summary}`;
}
