import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildPaperInstruction, buildSchemeContext } from "../marking/prompt";
import { RESPONSE_SCHEMA } from "../marking/response";
import { buildAnthropicParams, type MarkerInput } from "../marking/marker";
import type { Usage } from "./rates";

/**
 * One request per paper, to whichever provider a model belongs to.
 *
 * Every provider gets the same prompt — the same persona, mark scheme, worked
 * examples and photographs — and is asked for the same JSON shape. Claude gets
 * the app's own request, byte for byte, via `buildAnthropicParams`. The others
 * get the closest equivalent their API allows. A comparison is only fair if the
 * only thing that changes is the model.
 *
 * Request builders and reply parsers are pure, so the wire formats are tested
 * without keys or network. The callers at the bottom do the I/O.
 */

export type Provider = "anthropic" | "openai" | "google" | "local";

export function providerFor(model: string): Provider {
  if (model.startsWith("local:")) return "local";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (/^(gpt-|o\d)/.test(model)) return "openai";
  throw new Error(
    `Can't tell which provider "${model}" belongs to. Use a claude-, gpt-, gemini- model, or local:<name> for a model on this machine.`
  );
}

/** What every caller hands back. Text is parsed and checked by the bench, the same way for all. */
export type CallResult =
  | { ok: true; text: string; usage: Usage }
  | { ok: false; reason: string; usage: Usage | null };

const NO_USAGE: Usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

/** Persona + scheme + examples, as one block for providers without Anthropic's split system prompt. */
function systemText(input: MarkerInput): string {
  return `${SYSTEM_PROMPT}\n\n${buildSchemeContext({
    schemeTitle: input.schemeTitle,
    subject: input.subject,
    level: input.level,
    questions: input.questions,
    examples: input.examples,
  })}`;
}

const dataUrl = (p: MarkerInput["pages"][number]) => `data:${p.mediaType};base64,${p.data}`;

// ---------------------------------------------------------------------------
// OpenAI — Responses API
// ---------------------------------------------------------------------------

export function buildOpenAIRequest(input: MarkerInput, model: string) {
  return {
    model,
    instructions: systemText(input),
    input: [
      {
        role: "user",
        content: [
          // "high" detail: the default may downscale a page until handwriting
          // is unreadable, which would test the resize rather than the model.
          ...input.pages.map((p) => ({ type: "input_image", image_url: dataUrl(p), detail: "high" })),
          { type: "input_text", text: buildPaperInstruction(input.pages.length) },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "marking", strict: true, schema: RESPONSE_SCHEMA } },
    max_output_tokens: 16000,
  };
}

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
};

export function parseOpenAIResponse(body: OpenAIResponse): CallResult {
  // OpenAI counts cached tokens inside input_tokens; split them back out so
  // every provider's usage means the same thing.
  const cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
  const usage: Usage = {
    input: Math.max(0, (body.usage?.input_tokens ?? 0) - cached),
    cacheRead: cached,
    cacheWrite: 0,
    output: body.usage?.output_tokens ?? 0,
  };

  const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal")) return { ok: false, reason: "The model refused to mark this paper.", usage };
  if (body.status === "incomplete") {
    return { ok: false, reason: `The reply was cut off (${body.incomplete_details?.reason ?? "incomplete"}).`, usage };
  }
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  return { ok: true, text, usage };
}

// ---------------------------------------------------------------------------
// Google — Gemini generateContent
// ---------------------------------------------------------------------------

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; required?: readonly string[]; description?: string; [k: string]: unknown };

/**
 * JSON Schema → the OpenAPI subset `responseSchema` accepts.
 *
 * Types are upper-case there ("OBJECT", not "object"), and `additionalProperties`
 * isn't part of it — sending it gets the request rejected. Everything else that
 * matters (properties, required, items, descriptions) carries straight across.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  if (schema.type) out.type = schema.type.toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (schema.required) out.required = [...schema.required];
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

export function buildGeminiRequest(input: MarkerInput) {
  return {
    systemInstruction: { parts: [{ text: systemText(input) }] },
    contents: [
      {
        role: "user",
        parts: [
          ...input.pages.map((p) => ({ inlineData: { mimeType: p.mediaType, data: p.data } })),
          { text: buildPaperInstruction(input.pages.length) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(RESPONSE_SCHEMA as unknown as JsonSchema),
      // Covers thinking and the reply together on Gemini.
      maxOutputTokens: 16000,
    },
  };
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

export function parseGeminiResponse(body: GeminiResponse): CallResult {
  const m = body.usageMetadata ?? {};
  // promptTokenCount includes the cached part; thinking is billed as output.
  const cached = m.cachedContentTokenCount ?? 0;
  const usage: Usage = {
    input: Math.max(0, (m.promptTokenCount ?? 0) - cached),
    cacheRead: cached,
    cacheWrite: 0,
    output: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0),
  };

  if (body.promptFeedback?.blockReason) {
    return { ok: false, reason: `The request was blocked (${body.promptFeedback.blockReason}).`, usage };
  }
  const candidate = body.candidates?.[0];
  if (!candidate) return { ok: false, reason: "The model returned no answer.", usage };
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    return { ok: false, reason: `The reply stopped early (${candidate.finishReason}).`, usage };
  }
  // Thought summaries come back as parts too; only the answer is marked.
  const text = (candidate.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return { ok: true, text, usage };
}

// ---------------------------------------------------------------------------
// Local — any OpenAI-compatible Chat Completions server (Ollama, LM Studio, …)
// ---------------------------------------------------------------------------

export type LocalFormat = "json_object" | "json_schema" | "none";

/**
 * Local servers vary in how much structured output they honour. Ollama's
 * compatible endpoint documents JSON mode but not schemas; LM Studio and vLLM
 * take a schema. So the schema always goes in the system text as well, and the
 * enforcement is whatever the server supports — set with LOCAL_RESPONSE_FORMAT.
 */
export function buildLocalRequest(input: MarkerInput, model: string, format: LocalFormat = "json_object") {
  return {
    model,
    messages: [
      {
        role: "system",
        content: `${systemText(input)}\n\nReply with one JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(RESPONSE_SCHEMA)}`,
      },
      {
        role: "user",
        content: [
          ...input.pages.map((p) => ({ type: "image_url", image_url: { url: dataUrl(p) } })),
          { type: "text", text: buildPaperInstruction(input.pages.length) },
        ],
      },
    ],
    ...(format === "json_object" ? { response_format: { type: "json_object" } } : {}),
    ...(format === "json_schema"
      ? { response_format: { type: "json_schema", json_schema: { name: "marking", strict: true, schema: RESPONSE_SCHEMA } } }
      : {}),
    max_tokens: 16000,
  };
}

type ChatResponse = {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function parseLocalResponse(body: ChatResponse): CallResult {
  const usage: Usage = { input: body.usage?.prompt_tokens ?? 0, cacheRead: 0, cacheWrite: 0, output: body.usage?.completion_tokens ?? 0 };
  const choice = body.choices?.[0];
  if (!choice) return { ok: false, reason: "The model returned no answer.", usage };
  if (choice.message?.refusal) return { ok: false, reason: "The model refused to mark this paper.", usage };
  if (choice.finish_reason === "length") return { ok: false, reason: "The reply was cut off (too long).", usage };
  return { ok: true, text: choice.message?.content ?? "", usage };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export type CallOptions = { timeoutMs: number; env?: Record<string, string | undefined> };

/** The environment variable a provider needs, or null if it needs none. */
export function keyFor(provider: Provider, env: Record<string, string | undefined> = process.env): string | null {
  if (provider === "anthropic") return env.ANTHROPIC_API_KEY?.trim() || null;
  if (provider === "openai") return env.OPENAI_API_KEY?.trim() || null;
  if (provider === "google") return env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || null;
  return "local";
}

export const KEY_NAMES: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  local: "(none — needs a local server at LOCAL_MODEL_URL)",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST JSON, retrying the failures that are worth retrying — rate limits,
 * server errors, dropped connections — and nothing else. A 400 is our fault and
 * retrying it just spends money three times.
 */
async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000);
        continue;
      }
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    } catch (err) {
      lastError = controller.signal.aborted ? `timed out after ${Math.round(timeoutMs / 1000)}s` : String(err);
      await sleep(2 ** attempt * 2000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError || "request failed");
}

function describeHttpError(status: number, json: unknown): string {
  const message =
    (json as { error?: { message?: string } })?.error?.message ??
    (json as { raw?: string })?.raw?.slice(0, 200) ??
    JSON.stringify(json).slice(0, 200);
  if (status === 401 || status === 403) return `The API key was rejected (HTTP ${status}).`;
  if (status === 404) return `The model wasn't found (HTTP 404): ${message}`;
  return `HTTP ${status}: ${message}`;
}

export async function callModel(model: string, input: MarkerInput, opts: CallOptions): Promise<CallResult> {
  const env = opts.env ?? process.env;
  const provider = providerFor(model);
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.ANTHROPIC_BASE_URL || undefined,
        maxRetries: 3,
        timeout: opts.timeoutMs,
      });
      const response = await client.messages.create(buildAnthropicParams(input, model));
      const usage: Usage = {
        input: response.usage.input_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        output: response.usage.output_tokens,
      };
      if (response.stop_reason === "refusal") return { ok: false, reason: "The model refused to mark this paper.", usage };
      if (response.stop_reason === "max_tokens") return { ok: false, reason: "The reply was cut off (max_tokens).", usage };
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { ok: true, text, usage };
    }

    if (provider === "openai") {
      const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
      const { status, json } = await postJson(
        `${base}/responses`,
        { authorization: `Bearer ${env.OPENAI_API_KEY}` },
        buildOpenAIRequest(input, model),
        opts.timeoutMs
      );
      if (status >= 400) return { ok: false, reason: describeHttpError(status, json), usage: null };
      return parseOpenAIResponse(json as OpenAIResponse);
    }

    if (provider === "google") {
      const base = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
      const { status, json } = await postJson(
        `${base}/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) ?? "" },
        buildGeminiRequest(input),
        opts.timeoutMs
      );
      if (status >= 400) return { ok: false, reason: describeHttpError(status, json), usage: null };
      return parseGeminiResponse(json as GeminiResponse);
    }

    const base = (env.LOCAL_MODEL_URL || "http://localhost:11434/v1").replace(/\/$/, "");
    const format = (env.LOCAL_RESPONSE_FORMAT as LocalFormat) || "json_object";
    const { status, json } = await postJson(
      `${base}/chat/completions`,
      env.LOCAL_API_KEY ? { authorization: `Bearer ${env.LOCAL_API_KEY}` } : {},
      buildLocalRequest(input, model.slice("local:".length), format),
      opts.timeoutMs
    );
    if (status >= 400) return { ok: false, reason: describeHttpError(status, json), usage: null };
    return parseLocalResponse(json as ChatResponse);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "The API key was rejected.", usage: null };
    if (err instanceof Anthropic.NotFoundError) return { ok: false, reason: `The model wasn't found: ${err.message}`, usage: null };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, reason: `The request was rejected: ${err.message}`, usage: null };
    if (err instanceof Anthropic.APIError) return { ok: false, reason: `API error ${err.status ?? ""}: ${err.message}`, usage: null };
    return { ok: false, reason: err instanceof Error ? err.message : String(err), usage: null };
  }
}

export { NO_USAGE };
