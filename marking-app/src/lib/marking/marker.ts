import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PaperPage, RawMarking, SchemeQuestion, WorkedExample } from "./types";
import { SYSTEM_PROMPT, buildUserText } from "./prompt";

/**
 * The one place that talks to a model.
 *
 * Everything around it is pure, so this file stays small and every failure it
 * can have — no key, a refusal, a timeout, an unparseable response — comes back
 * as the same thing: `ok: false` with a sentence a tutor can read. The caller
 * then sends the paper to the human queue. There is no path here that invents a
 * mark to avoid an error.
 */

const MODEL = "claude-opus-5";

/** Per-question output. `available` is deliberately absent — the scheme owns it. */
const RESPONSE_SCHEMA = {
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
const RawMarkingSchema = z.object({
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

export type MarkerInput = {
  schemeTitle: string;
  subject: string;
  level?: string | null;
  questions: SchemeQuestion[];
  examples: WorkedExample[];
  pages: PaperPage[];
};

export type MarkerOutcome =
  | { ok: true; raw: RawMarking; model: string }
  /** `retryable` separates "come back in a minute" from "a person must do this". */
  | { ok: false; reason: string; retryable: boolean };

/** True when a model can actually be called. The UI says so when it can't. */
export function markingIsConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export async function markPaper(input: MarkerInput): Promise<MarkerOutcome> {
  if (!markingIsConfigured()) {
    return {
      ok: false,
      reason: "AI marking is not configured on this server (no ANTHROPIC_API_KEY), so this paper needs marking by hand.",
      retryable: false,
    };
  }
  if (input.pages.length === 0) return { ok: false, reason: "No photographs were attached to this paper.", retryable: false };
  if (input.questions.length === 0) return { ok: false, reason: "This mark scheme has no questions to mark against.", retryable: false };

  const client = new Anthropic({ maxRetries: 2, timeout: 240_000 });

  const text = buildUserText({
    schemeTitle: input.schemeTitle,
    subject: input.subject,
    level: input.level,
    questions: input.questions,
    examples: input.examples,
    pageCount: input.pages.length,
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // The scheme and its worked examples are identical for every paper marked
      // against this scheme, and they sit before the per-paper instruction, so
      // a class set of papers reuses the cached prefix.
      cache_control: { type: "ephemeral" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            ...input.pages.map((page) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: page.mediaType, data: page.data },
            })),
            { type: "text" as const, text },
          ],
        },
      ],
    });

    // A refusal is not an error to retry — it is a paper a person should look
    // at. Check it before reading content, which may be empty.
    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "The marking model declined to mark this paper. A tutor needs to mark it by hand.", retryable: false };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, reason: "The paper was too long to mark in one pass. Split it into fewer questions per upload.", retryable: false };
    }

    const body = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!body) return { ok: false, reason: "The marking model returned nothing to mark with.", retryable: true };

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body);
    } catch {
      return { ok: false, reason: "The marking model's response could not be read as marks.", retryable: true };
    }

    const parsed = RawMarkingSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { ok: false, reason: "The marking model returned marks in an unexpected shape.", retryable: true };
    }

    return { ok: true, raw: parsed.data, model: response.model };
  } catch (err) {
    // Most specific first, so a 400 we caused is never reported as "try again".
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: "The marking API key was rejected. Marking is unavailable until it is fixed.", retryable: false };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "The marking service is rate limited right now. Try this paper again shortly.", retryable: true };
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("marking request rejected", err);
      return { ok: false, reason: "The marking service rejected this paper — the photographs may be too large.", retryable: false };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, reason: "Could not reach the marking service. Try this paper again shortly.", retryable: true };
    }
    console.error("marking failed", err);
    return { ok: false, reason: "Marking failed unexpectedly. This paper needs marking by hand.", retryable: true };
  }
}
