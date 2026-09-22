import type { MarkingStatus } from "@prisma/client";

/**
 * How a marking status is shown. One table, used by every page, so a paper
 * doesn't read as "Marked" in the list and "Needs you" on its own page.
 *
 * The wording is deliberately about what the tutor has to DO. "NEEDS_HUMAN" is
 * the normal, expected outcome for messy handwriting — it is not an error, and
 * a chip that reads like one teaches people to distrust the whole thing.
 */

export type StatusView = { label: string; tone: string; hint: string };

const VIEWS: Record<MarkingStatus, StatusView> = {
  PENDING: { label: "Not marked yet", tone: "bg-[var(--soft)] text-[var(--muted)]", hint: "Uploaded, waiting to be marked." },
  MARKING: { label: "Marking…", tone: "bg-sky/15 text-sky", hint: "Reading the paper now." },
  MARKED: { label: "Marked", tone: "bg-teal/15 text-teal", hint: "Marked automatically. Worth a glance before you hand it back." },
  NEEDS_HUMAN: { label: "Needs you", tone: "bg-amber/15 text-amber", hint: "Part of this paper could not be marked with confidence." },
  REVIEWED: { label: "Checked by you", tone: "bg-teal/15 text-teal", hint: "A person has been through this paper." },
  FAILED: { label: "Marking failed", tone: "bg-coral/15 text-coral", hint: "Something went wrong. Try marking it again." },
};

export function statusView(status: MarkingStatus): StatusView {
  return VIEWS[status];
}

/** Statuses that are waiting on a person rather than on the machine. */
export const WAITING_ON_HUMAN: MarkingStatus[] = ["NEEDS_HUMAN", "FAILED"];

/** Statuses with a score worth showing. */
export function hasScore(status: MarkingStatus): boolean {
  return status === "MARKED" || status === "REVIEWED" || status === "NEEDS_HUMAN";
}

/**
 * Confidence as words.
 *
 * A raw "0.71" means nothing to a tutor between lessons. The thresholds match
 * scoring.ts's floor, so "low" here and "sent to you" there are the same line.
 */
export function confidenceLabel(confidence: number | null): string {
  if (confidence == null) return "—";
  if (confidence >= 0.9) return "High";
  if (confidence >= 0.6) return "Moderate";
  return "Low";
}

/**
 * How much a student has improved, as a percentage-point change.
 *
 * Returns null when there is nothing to compare against — one paper is not a
 * trend, and a made-up trend is worse than a blank.
 */
export function trend(percentages: number[]): { change: number; direction: "up" | "down" | "flat" } | null {
  if (percentages.length < 2) return null;
  const change = percentages[percentages.length - 1] - percentages[0];
  return { change, direction: change > 2 ? "up" : change < -2 ? "down" : "flat" };
}
