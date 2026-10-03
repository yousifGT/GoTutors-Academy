import { describe, it, expect } from "vitest";
import {
  buildGeminiRequest,
  buildLocalRequest,
  buildOpenAIRequest,
  keyFor,
  parseGeminiResponse,
  parseLocalResponse,
  parseOpenAIResponse,
  providerFor,
  toGeminiSchema,
} from "./providers";
import { buildAnthropicParams, supportsEffort, type MarkerInput } from "../marking/marker";
import { RESPONSE_SCHEMA } from "../marking/response";

const input: MarkerInput = {
  schemeTitle: "Paper 1",
  subject: "Maths",
  level: "Year 6",
  questions: [{ id: "q1", label: "1", order: 0, prompt: "2+2", expectedAnswer: "4", marks: 1 }],
  examples: [],
  pages: [
    { data: "AAAA", mediaType: "image/png" },
    { data: "BBBB", mediaType: "image/jpeg" },
  ],
};

describe("providerFor", () => {
  it("routes each model family to its provider", () => {
    expect(providerFor("claude-opus-5")).toBe("anthropic");
    expect(providerFor("gpt-6-sol")).toBe("openai");
    expect(providerFor("o4-mini")).toBe("openai");
    expect(providerFor("gemini-3.8-flash")).toBe("google");
    expect(providerFor("local:qwen3-vl:8b")).toBe("local");
  });

  it("refuses to guess at a model it doesn't recognise", () => {
    expect(() => providerFor("mystery-model")).toThrow(/Can't tell which provider/);
  });
});

describe("keyFor", () => {
  it("accepts either name Google uses for its key", () => {
    expect(keyFor("google", { GOOGLE_API_KEY: "g" })).toBe("g");
    expect(keyFor("google", { GEMINI_API_KEY: "m", GOOGLE_API_KEY: "g" })).toBe("m");
  });

  it("treats a blank key as missing", () => {
    expect(keyFor("openai", { OPENAI_API_KEY: "  " })).toBeNull();
  });
});

describe("Claude: the bench sends the app's own request", () => {
  it("keeps the cached system prefix and the images-then-instruction order", () => {
    const params = buildAnthropicParams(input, "claude-opus-5");
    expect(params.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages[0].content.map((c) => c.type)).toEqual(["image", "image", "text"]);
    expect(params.output_config.format.schema).toBe(RESPONSE_SCHEMA);
  });

  it("asks for high effort on models that take it, and leaves it off Haiku 4.5, which rejects it", () => {
    expect(buildAnthropicParams(input, "claude-opus-5").output_config).toHaveProperty("effort", "high");
    expect(buildAnthropicParams(input, "claude-haiku-4-5").output_config).not.toHaveProperty("effort");
    expect(supportsEffort("claude-sonnet-5")).toBe(true);
  });
});

describe("OpenAI request", () => {
  const req = buildOpenAIRequest(input, "gpt-6-sol");

  it("sends each page as a high-detail base64 image, then the instruction", () => {
    const content = req.input[0].content as { type: string; image_url?: string; detail?: string }[];
    expect(content.map((c) => c.type)).toEqual(["input_image", "input_image", "input_text"]);
    expect(content[0].image_url).toBe("data:image/png;base64,AAAA");
    expect(content[0].detail).toBe("high");
  });

  it("asks for the app's schema, strictly, with the name the API requires", () => {
    expect(req.text.format).toMatchObject({ type: "json_schema", name: "marking", strict: true });
    expect(req.text.format.schema).toBe(RESPONSE_SCHEMA);
  });

  it("carries the scheme in the instructions, as the app does in its system prompt", () => {
    expect(req.instructions).toContain("Mark scheme: Paper 1");
    expect(req.instructions).toContain("experienced examiner");
  });
});

describe("OpenAI reply", () => {
  it("separates cached tokens out of input_tokens, which counts them in", () => {
    const r = parseOpenAIResponse({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
      usage: { input_tokens: 8000, output_tokens: 3000, input_tokens_details: { cached_tokens: 3000 } },
    });
    expect(r.usage).toEqual({ input: 5000, cacheRead: 3000, cacheWrite: 0, output: 3000 });
  });

  it("reads the text from message items and ignores reasoning items", () => {
    const r = parseOpenAIResponse({
      status: "completed",
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text: '{"a":' }, { type: "output_text", text: "1}" }] },
      ],
    });
    expect(r).toMatchObject({ ok: true, text: '{"a":1}' });
  });

  it("reports a refusal and a cut-off reply as failures", () => {
    expect(parseOpenAIResponse({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }).ok).toBe(false);
    expect(parseOpenAIResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("max_output_tokens"),
    });
  });
});

describe("Gemini request", () => {
  it("converts the schema to the subset responseSchema accepts", () => {
    const s = toGeminiSchema(RESPONSE_SCHEMA as never);
    expect(s.type).toBe("OBJECT");
    expect(JSON.stringify(s)).not.toContain("additionalProperties");
    const markItem = (s.properties as Record<string, { items: { properties: Record<string, { type: string }> } }>).marks.items;
    expect(markItem.properties.awarded.type).toBe("INTEGER");
    expect(markItem.properties.legible.type).toBe("BOOLEAN");
    expect(s.required).toContain("marks");
  });

  it("sends pages as inline data, then the instruction, with the scheme as the system instruction", () => {
    const req = buildGeminiRequest(input);
    const parts = req.contents[0].parts as { inlineData?: { mimeType: string; data: string }; text?: string }[];
    expect(parts[0].inlineData).toEqual({ mimeType: "image/png", data: "AAAA" });
    expect(parts[2].text).toContain("2 images above");
    expect(req.systemInstruction.parts[0].text).toContain("Mark scheme: Paper 1");
    expect(req.generationConfig.responseMimeType).toBe("application/json");
  });
});

describe("Gemini reply", () => {
  it("bills thinking as output and separates the cached prompt", () => {
    const r = parseGeminiResponse({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }],
      usageMetadata: { promptTokenCount: 8000, cachedContentTokenCount: 2000, candidatesTokenCount: 1500, thoughtsTokenCount: 2500 },
    });
    expect(r.usage).toEqual({ input: 6000, cacheRead: 2000, cacheWrite: 0, output: 4000 });
  });

  it("leaves thought summaries out of the answer", () => {
    const r = parseGeminiResponse({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking…", thought: true }, { text: "{}" }] } }],
    });
    expect(r).toMatchObject({ ok: true, text: "{}" });
  });

  it("reports a blocked prompt and an early stop as failures", () => {
    expect(parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }).ok).toBe(false);
    expect(parseGeminiResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("MAX_TOKENS"),
    });
  });
});

describe("local request and reply", () => {
  it("sends base64 data URLs, and the schema in the system text because enforcement varies", () => {
    const req = buildLocalRequest(input, "qwen3-vl:8b");
    const user = req.messages[1].content as { type: string; image_url?: { url: string } }[];
    expect(user[0].image_url?.url).toBe("data:image/png;base64,AAAA");
    expect(req.messages[0].content).toContain('"transcript"');
    expect(req.response_format).toEqual({ type: "json_object" });
  });

  it("can ask for a strict schema on servers that support one", () => {
    const req = buildLocalRequest(input, "m", "json_schema");
    expect(req.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "marking" } });
    expect(buildLocalRequest(input, "m", "none")).not.toHaveProperty("response_format");
  });

  it("reads the reply and reports a cut-off one", () => {
    expect(parseLocalResponse({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] })).toMatchObject({ ok: true, text: "{}" });
    expect(parseLocalResponse({ choices: [{ finish_reason: "length", message: { content: "{" } }] }).ok).toBe(false);
  });
});
