import Anthropic from "@anthropic-ai/sdk";
import type { PaperPage, RawMarking, SchemeQuestion, WorkedExample } from "./types";
import { SYSTEM_PROMPT, buildPaperInstruction, buildSchemeContext } from "./prompt";
import { RESPONSE_SCHEMA, parseMarkingText } from "./response";

/**
 * The one place that talks to a model.
 *
 * Everything around it is pure, so this file stays small and every failure it
 * can have — no key, a refusal, a timeout, an unparseable response — comes back
 * as the same thing: `ok: false` with a sentence a tutor can read. The caller
 * then sends the paper to the human queue. There is no path here that invents a
 * mark to avoid an error.
 */

/** The model the app marks with. The bench can run others through the same request. */
export const MARKING_MODEL = "claude-opus-5";

/**
 * Whether a model accepts `output_config.effort`.
 *
 * Every current Claude model does except Haiku 4.5 (and the older Sonnet 4.5),
 * which reject it with a 400. The bench runs those too, so the request has to
 * know rather than assume.
 */
export function supportsEffort(model: string): boolean {
  return !/^claude-(haiku-4-5|sonnet-4-5)/.test(model);
}

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

  try {
    const response = await client.messages.create(buildAnthropicParams(input));

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
      .join("");

    const parsed = parseMarkingText(body);
    if (!parsed.ok) {
      const reason = {
        empty: "The marking model returned nothing to mark with.",
        not_json: "The marking model's response could not be read as marks.",
        wrong_shape: "The marking model returned marks in an unexpected shape.",
      }[parsed.kind];
      return { ok: false, reason, retryable: true };
    }

    return { ok: true, raw: parsed.raw, model: response.model };
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

/**
 * The exact request the app sends to mark one paper.
 *
 * Exported so the bench sends the same bytes: a comparison that tested a
 * request the app never makes would be measuring the wrong thing.
 */
export function buildAnthropicParams(input: MarkerInput, model: string = MARKING_MODEL) {
  // Split so the cache prefix is stable: everything identical across papers
  // marked against this scheme goes in `system`, and only the photographs and
  // one instruction line vary per request.
  const schemeContext = buildSchemeContext({
    schemeTitle: input.schemeTitle,
    subject: input.subject,
    level: input.level,
    questions: input.questions,
    examples: input.examples,
  });

  return {
    model,
    max_tokens: 16000,
    system: [
      { type: "text" as const, text: SYSTEM_PROMPT },
      // Render order is tools -> system -> messages, so a breakpoint here
      // caches the persona, the scheme and every worked example. A class set
      // marked against one scheme then pays for that prefix once.
      { type: "text" as const, text: schemeContext, cache_control: { type: "ephemeral" as const } },
    ],
    output_config: {
      ...(supportsEffort(model) ? { effort: "high" as const } : {}),
      format: { type: "json_schema" as const, schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: "user" as const,
        content: [
          ...input.pages.map((page) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: page.mediaType, data: page.data },
          })),
          { type: "text" as const, text: buildPaperInstruction(input.pages.length) },
        ],
      },
    ],
  };
}
