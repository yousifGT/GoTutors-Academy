import { z } from "zod";
import type { RawMarking } from "./types";

/**
 * What the marker must send back, and how its reply is read.
 *
 * Shared by the app's own marker and by the bench, deliberately: a bench that
 * asked for a different shape, or forgave a reply the app would reject, would
 * be measuring a product nobody runs.
 */

/** Per-question output. `available` is deliberately absent — the scheme owns it. */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    marks: {
      type: "array",
      description: "One entry per question in the mark scheme, in mark scheme order.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "The question label, exactly as the mark scheme writes it." },
          transcript: { type: "string", description: "What the student wrote, transcribed verbatim. Empty if nothing was found." },
          legible: { type: "boolean", description: "False if the answer could not be read or found." },
          awarded: { type: "integer", description: "Whole marks awarded, 0 to the marks available." },
          comment: { type: "string", description: "One or two sentences to the student about this question." },
          confidence: { type: "number", description: "How sure you are of this mark, 0 to 1." },
        },
        required: ["label", "transcript", "legible", "awarded", "comment", "confidence"],
        additionalProperties: false,
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    overallComment: { type: "string" },
    unreadable: { type: "boolean", description: "True only if the photographs cannot be marked at all." },
  },
  required: ["marks", "strengths", "improvements", "overallComment", "unreadable"],
  additionalProperties: false,
} as const;

/** The same shape again, for checking what actually came back. */
export const RawMarkingSchema = z.object({
  marks: z.array(
    z.object({
      label: z.string(),
      transcript: z.string(),
      legible: z.boolean(),
      awarded: z.number(),
      comment: z.string(),
      confidence: z.number(),
    })
  ),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  overallComment: z.string(),
  unreadable: z.boolean(),
});

export type ParsedReply =
  | { ok: true; raw: RawMarking }
  | { ok: false; kind: "empty" | "not_json" | "wrong_shape" };

/**
 * Read a model's reply as marks.
 *
 * Providers that enforce the schema return bare JSON. Ones that only promise
 * "JSON mode" — most local models — sometimes wrap it in a ```json fence, so the
 * fence is tolerated. Nothing else is: a reply that doesn't validate is a
 * failure, never a partial mark.
 */
export function parseMarkingText(text: string): ParsedReply {
  let body = text.trim();
  if (!body) return { ok: false, kind: "empty" };
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(body);
  if (fenced) body = fenced[1].trim();

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, kind: "not_json" };
  }
  const parsed = RawMarkingSchema.safeParse(json);
  return parsed.success ? { ok: true, raw: parsed.data } : { ok: false, kind: "wrong_shape" };
}
