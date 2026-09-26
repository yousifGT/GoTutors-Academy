#!/usr/bin/env node
/**
 * What one paper actually costs to mark, measured rather than guessed.
 *
 * Builds the real prompt this app sends — your mark scheme, your worked
 * examples, a real page image — counts its tokens with the API's own counter,
 * and prices it at each model's published rates.
 *
 *   node scripts/estimate-cost.mjs                  # the largest scheme in the database
 *   node scripts/estimate-cost.mjs <markSchemeId>   # a specific one
 *
 * Needs ANTHROPIC_API_KEY and DATABASE_URL. Counting tokens is free — this
 * script never runs a marking request, so it costs nothing to run.
 *
 * Rates below are the published per-MTok prices; check them against
 * https://claude.com/pricing before quoting a figure to anyone, because they
 * move and this file does not.
 */
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { SYSTEM_PROMPT, buildPaperInstruction, buildSchemeContext } from "../src/lib/marking/prompt.ts";
import { readUpload } from "../src/lib/storage.ts";

/** $ per million tokens. cacheRead is what a prefix hit costs. */
const RATES = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** What the model writes back: a mark per question, plus the feedback. */
const OUTPUT_TOKENS_PER_QUESTION = 60;
const OUTPUT_TOKENS_FEEDBACK = 300;
/**
 * Adaptive thinking is billed as output and is not visible in the response, so
 * it cannot be measured from a token count — only from a real run's
 * `usage.output_tokens`. This is a placeholder until you have that number.
 */
const ASSUMED_THINKING_TOKENS = 2500;

const prisma = new PrismaClient();
const client = new Anthropic();

// A stack trace for "you have not set a key yet" helps nobody.
process.on("uncaughtException", (err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error("The API key was rejected. Set ANTHROPIC_API_KEY to a valid key and try again.");
    process.exit(1);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    console.error("Could not reach the API. Check the network and try again.");
    process.exit(1);
  }
  throw err;
});

const scheme = await prisma.markScheme.findFirst({
  where: process.argv[2] ? { id: process.argv[2] } : {},
  orderBy: { questions: { _count: "desc" } },
  include: { questions: { orderBy: { order: "asc" } }, examples: true },
});
if (!scheme) {
  console.error("No mark scheme found. Run `npm run db:seed` first, or pass an id.");
  process.exit(1);
}

const submission = await prisma.submission.findFirst({
  where: { markSchemeId: scheme.id, pageUrls: { isEmpty: false } },
  orderBy: { createdAt: "desc" },
});

const questions = scheme.questions.map((q) => ({
  id: q.id,
  label: q.label,
  order: q.order,
  prompt: q.prompt,
  expectedAnswer: q.expectedAnswer,
  marks: q.marks,
  guidance: q.guidance,
}));
const examples = scheme.examples.map((e) => ({
  questionId: e.questionId,
  studentAnswer: e.studentAnswer,
  awarded: e.awarded,
  available: e.available,
  examinerComment: e.examinerComment,
  source: e.source,
  createdAt: e.createdAt,
}));

const schemeContext = buildSchemeContext({
  schemeTitle: scheme.title,
  subject: scheme.subject,
  level: scheme.level,
  questions,
  examples,
});

// The stable half — counted on its own, because this is what caching saves.
const prefix = await client.messages.countTokens({
  model: "claude-opus-5",
  system: [{ type: "text", text: SYSTEM_PROMPT }, { type: "text", text: schemeContext }],
  messages: [{ role: "user", content: "x" }],
});

let imageTokens = null;
if (submission) {
  const pages = [];
  for (const url of submission.pageUrls) {
    const { bytes, contentType } = await readUpload(url);
    pages.push({
      type: "image",
      source: { type: "base64", media_type: contentType.split(";")[0], data: bytes.toString("base64") },
    });
  }
  const withPages = await client.messages.countTokens({
    model: "claude-opus-5",
    system: [{ type: "text", text: SYSTEM_PROMPT }, { type: "text", text: schemeContext }],
    messages: [{ role: "user", content: [...pages, { type: "text", text: buildPaperInstruction(pages.length) }] }],
  });
  imageTokens = withPages.input_tokens - prefix.input_tokens;
  console.log(`Pages measured: ${pages.length} (from the most recent paper on this scheme)`);
}

const output = questions.length * OUTPUT_TOKENS_PER_QUESTION + OUTPUT_TOKENS_FEEDBACK + ASSUMED_THINKING_TOKENS;

console.log(`\nMark scheme: ${scheme.title} — ${questions.length} questions, ${examples.length} worked examples`);
console.log(`Cacheable prefix: ${prefix.input_tokens.toLocaleString()} tokens (system + scheme + examples)`);
console.log(`Per-paper input:  ${imageTokens === null ? "no paper uploaded yet — mark one, then re-run" : `${imageTokens.toLocaleString()} tokens of page images`}`);
console.log(`Assumed output:   ${output.toLocaleString()} tokens (${ASSUMED_THINKING_TOKENS.toLocaleString()} of it assumed thinking — replace with a real usage.output_tokens)`);

if (imageTokens === null) process.exit(0);

const rows = [];
for (const [model, rate] of Object.entries(RATES)) {
  const first = (prefix.input_tokens * rate.cacheWrite + imageTokens * rate.input + output * rate.output) / 1e6;
  const warm = (prefix.input_tokens * rate.cacheRead + imageTokens * rate.input + output * rate.output) / 1e6;
  rows.push({
    model,
    "first paper": `$${first.toFixed(4)}`,
    "each after (cached)": `$${warm.toFixed(4)}`,
    "per 1,000 papers": `$${(warm * 1000).toFixed(0)}`,
    "…on Batch API": `$${(warm * 500).toFixed(0)}`,
  });
}
console.log("");
console.table(rows);
console.log("Batch API is half price and not for anyone waiting on a result — use it for overnight class sets, not live marking.");
console.log("Rates are the published per-MTok prices in this file; confirm at https://claude.com/pricing.");

await prisma.$disconnect();
