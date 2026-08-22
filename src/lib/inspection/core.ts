/**
 * Typed access to the shared inspection rules.
 *
 * The rules themselves live in `inspection-app/core/inspection-core.js` and are
 * deliberately plain JavaScript: the same file runs in this server, in a Lambda,
 * and in a browser front end, so scoring can never drift between them. This
 * module only puts a TypeScript face on it — do not reimplement a rule here.
 *
 * See `inspection-app/README.md` for what each rule does.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
import rawCore from "@inspection/core/inspection-core.js";

export type Size = "small" | "medium" | "large" | "";
export type CoreQuestionType = "rating" | "yesno" | "scale" | "number" | "choice";
export type Bucket = "well" | "improve" | "obs" | "skip";

/** A question plus the answer and notes an inspection adds to it. */
export interface CoreItem {
  text: string;
  type: CoreQuestionType;
  options?: string[] | null;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
  scored?: boolean;
  requireNote?: boolean;
  critical?: boolean;
  photoExempt?: boolean;
  allowNA?: boolean;
  whoField?: boolean;
  guide?: string | null;
  dos?: string[] | null;
  donts?: string[] | null;
  sizeGuide?: Partial<Record<"small" | "medium" | "large", { text: string }>> | null;
  minBySize?: Partial<Record<"small" | "medium" | "large", number>> | null;
  tally?: string | null;
  answer: string | null;
  entries: { note?: string; who?: string; photos?: string[] }[];
}

export interface CoreSection {
  title: string;
  items: CoreItem[];
}

export interface Verdict {
  word: "Good" | "Satisfactory" | "Needs attention" | "Serious finding";
  color: string;
}

export interface InspectionScore {
  pct: number;
  scored: number;
  well: number;
  poor: number;
  obs: number;
  unanswered: number;
  /** Question text of every failed critical item. Non-empty ⇒ "Serious finding". */
  criticalFails: string[];
  verdict: Verdict;
}

interface Core {
  TYPE_LABELS: Record<CoreQuestionType, string>;
  optionsFor(item: CoreItem): [string, string][];
  itemScore(item: CoreItem): number | null;
  bucketOf(item: CoreItem, size?: Size): Bucket;
  notesRequired(item: CoreItem, size?: Size): boolean;
  criticalFail(item: CoreItem, size?: Size): boolean;
  photoRequired(item: CoreItem, size?: Size): boolean;
  verdictFor(pct: number): Verdict;
  answerText(item: CoreItem): string;
  resolveGuide(item: CoreItem, size?: Size): { text: string; dos: string[]; donts: string[] };
  scoreInspection(sections: CoreSection[], size?: Size): InspectionScore;
  fmtDuration(ms: number): string;
}

export const core = rawCore as unknown as Core;

export const {
  optionsFor,
  itemScore,
  bucketOf,
  notesRequired,
  criticalFail,
  photoRequired,
  verdictFor,
  answerText,
  resolveGuide,
  scoreInspection,
  fmtDuration,
} = core;
