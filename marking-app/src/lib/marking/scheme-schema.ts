import { z } from "zod";
import { zName } from "@/lib/validate";

/**
 * The shape of a mark scheme as it arrives from the editor.
 *
 * Shared by create and edit deliberately: the two have drifted apart in every
 * codebase that defines them separately, and the result is a field that saves
 * on one path and is silently rejected on the other.
 */

export const QuestionSchema = z.object({
  label: z.string().trim().min(1, "Every question needs a label").max(40),
  prompt: z.string().trim().min(1, "Every question needs the question text").max(4000),
  expectedAnswer: z.string().trim().min(1, "Every question needs an expected answer").max(4000),
  marks: z.number().int().min(1, "A question must be worth at least 1 mark").max(100),
  guidance: z.string().trim().max(4000).optional().nullable(),
});

export const SchemeSchema = z.object({
  title: zName,
  subject: z.string().trim().min(1, "A subject is required").max(100),
  level: z.string().trim().max(100).optional().nullable(),
  shared: z.boolean().optional(),
  questions: z.array(QuestionSchema).min(1, "A mark scheme needs at least one question").max(200),
});

/**
 * Two questions with the same label can't both be marked: mark rows key on
 * (submission, label), so the second would overwrite the first and one
 * question's marks would vanish without an error anywhere.
 */
export function duplicateLabel(questions: { label: string }[]): string | null {
  const seen = new Set<string>();
  for (const q of questions) {
    const key = q.label.trim().toLowerCase();
    if (seen.has(key)) return q.label;
    seen.add(key);
  }
  return null;
}
