#!/usr/bin/env node
/**
 * The bench: which model marks most like your tutors?
 *
 *   npm run bench -- --models claude-opus-5,claude-sonnet-5,gpt-6-sol,gemini-3.8-flash
 *   npm run bench -- --models claude-opus-5,claude-sonnet-5 --yes
 *
 * Takes papers a tutor has already marked by hand in the app (status "Checked
 * by you") as the answer key, runs each one through every model named, and
 * reports how often each agreed with the tutor — and, above all, how often it
 * was confidently wrong on a paper nobody would have checked.
 *
 * Without --yes it only prints the plan and an upper-bound cost estimate, and
 * spends nothing. With --yes it runs. Results are cached by the exact request,
 * so an interrupted run resumes without paying twice and a re-run with the same
 * papers and brain costs nothing; --fresh ignores the cache.
 *
 * Keys come from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * GEMINI_API_KEY. A model whose key is missing is skipped, not fatal. Models on
 * this machine are named local:<model> and reached at LOCAL_MODEL_URL
 * (default http://localhost:11434/v1, Ollama's).
 *
 * Results land in ./bench-results, which holds children's answers: it is
 * gitignored and should stay on the centre's own machine.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readUpload } from "../src/lib/storage.ts";
import { checkMarking } from "../src/lib/marking/scoring.ts";
import { parseMarkingText } from "../src/lib/marking/response.ts";
import { SYSTEM_PROMPT, buildPaperInstruction, buildSchemeContext } from "../src/lib/marking/prompt.ts";
import { KEY_NAMES, callModel, keyFor, providerFor } from "../src/lib/bench/providers.ts";
import { hardestQuestions, scorePaper, summarise } from "../src/lib/bench/score.ts";
import { FX_CHECKED, USD_TO_GBP, costUsd, ratesFor } from "../src/lib/bench/rates.ts";
import { parseArgs, resolveOrganisation } from "./cli.mjs";

/** Bump when an adapter changes what it sends, so old cached replies aren't reused. */
const CACHE_VERSION = 1;

const MEDIA_TYPES = { "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp", "image/gif": "image/gif" };

const args = parseArgs(process.argv.slice(2), {
  models: "value",
  limit: "value",
  scheme: "value",
  org: "value",
  "from-scratch-only": "flag",
  examples: "value",
  concurrency: "value",
  timeout: "value",
  fx: "value",
  out: "value",
  fresh: "flag",
  yes: "flag",
});

const models = (args.models ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const limit = Number(args.limit ?? 30);
const concurrency = Math.max(1, Number(args.concurrency ?? 2));
const timeoutMs = Math.max(30, Number(args.timeout ?? 300)) * 1000;
const fx = Number(args.fx ?? USD_TO_GBP);
const examplesOn = (args.examples ?? "on") !== "off";
const outDir = path.resolve(args.out ?? "bench-results");

const prisma = new PrismaClient();

async function main() {
  if (models.length === 0) {
    throw new Error(
      "Name the models to compare, e.g.\n  npm run bench -- --models claude-opus-5,claude-sonnet-5,gpt-6-sol,gemini-3.8-flash"
    );
  }
  for (const m of models) providerFor(m); // fail on a typo before anything else

  const org = await resolveOrganisation(prisma, args.org);
  const papers = await loadAnswerKey(org.id);
  if (papers.length === 0) {
    throw new Error(
      [
        "There is no answer key yet.",
        "The bench compares models against papers a tutor has marked by hand. Mark some papers in",
        'the app — open a paper and use "Mark by hand", or correct an AI-marked one — and they will',
        'show here once they read "Checked by you". Messy ones are worth more than neat ones.',
      ].join("\n")
    );
  }

  printAnswerKey(papers);

  // What each model would cost, before anything is spent.
  const plan = [];
  for (const model of models) {
    const provider = providerFor(model);
    const key = keyFor(provider);
    let cached = 0;
    let estimate = 0;
    for (const paper of papers) {
      if (!args.fresh && (await readCache(model, requestHash(model, paper)))) cached++;
      else estimate += estimateUsd(model, paper);
    }
    plan.push({ model, provider, ready: !!key, cached, estimate });
  }
  printPlan(plan);

  const runnable = plan.filter((p) => p.ready);
  if (runnable.length === 0) throw new Error("None of these models can run — no API keys are set for them.");
  if (!args.yes) {
    const total = runnable.reduce((n, p) => n + p.estimate, 0);
    console.log(
      `\nNothing has been spent. Run again with --yes to go ahead${total > 0 ? ` (up to about ${gbp(total)})` : " (everything is cached — it's free)"}.`
    );
    return;
  }

  // ---- Run ---------------------------------------------------------------
  const byModel = {};
  const runs = {};
  for (const { model } of runnable) {
    console.log(`\n${model}`);
    const rows = await pool(papers, concurrency, async (paper, i) => {
      const hash = requestHash(model, paper);
      let call = args.fresh ? null : await readCache(model, hash);
      const cached = !!call;
      if (!call) {
        const started = Date.now();
        const result = await callModel(model, paper.input, { timeoutMs });
        call = { ...result, ms: Date.now() - started };
        // Every reply the model actually gave is cached, including one that
        // won't parse: a bad reply is that model's measured result. A timeout,
        // rate limit or HTTP error says nothing about the model, so it isn't
        // cached and the next run tries again.
        if (result.ok) await writeCache(model, hash, call);
      }

      let outcome;
      if (!call.ok) outcome = { ok: false, reason: call.reason };
      else {
        const parsed = parseMarkingText(call.text);
        outcome = parsed.ok
          ? { ok: true, checked: checkMarking(parsed.raw, paper.input.questions) }
          : { ok: false, reason: { empty: "empty reply", not_json: "reply wasn't JSON", wrong_shape: "reply wasn't in the marking shape" }[parsed.kind] };
      }

      const score = scorePaper(paper.id, paper.key, outcome);
      const cost = call.usage ? costUsd(model, call.usage) : null;
      const line = score.failed
        ? `failed — ${score.failure}`
        : `${score.modelTotal}/${paper.available} vs tutor ${score.tutorTotal}/${paper.available}${score.toPerson ? " · would go to a person" : ""}`;
      console.log(
        `  [${String(i + 1).padStart(String(papers.length).length)}/${papers.length}] ${shortId(paper.id)} ${line} · ${(call.ms / 1000).toFixed(1)}s${
          cached ? " · cached" : cost !== null ? ` · ${gbp(cost)}` : ""
        }`
      );
      return { score, usage: call.usage, ms: call.ms, cached, cost };
    });

    byModel[model] = rows.map((r) => r.score);
    const costed = rows.filter((r) => r.cost !== null);
    runs[model] = {
      summary: summarise(byModel[model]),
      secondsPerPaper: rows.reduce((n, r) => n + r.ms, 0) / rows.length / 1000,
      costPerPaper: costed.length ? costed.reduce((n, r) => n + r.cost, 0) / costed.length : null,
      spentThisRun: rows.filter((r) => !r.cached && r.cost !== null).reduce((n, r) => n + r.cost, 0),
      cachedReused: rows.filter((r) => r.cached).length,
      priceKnown: !!ratesFor(model) || model.startsWith("local:"),
    };
  }

  // ---- Report ------------------------------------------------------------
  const table = resultsTable(runs);
  console.log("\n" + table);
  const spent = Object.values(runs).reduce((n, r) => n + r.spentThisRun, 0);
  const reused = Object.values(runs).reduce((n, r) => n + r.cachedReused, 0);
  console.log(`\nSpent this run: ${gbp(spent)}${reused ? ` · ${reused} cached results reused for free` : ""}`);
  console.log(howToRead());

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(outDir, stamp);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "report.md"), renderReport(org, papers, runs, byModel, table), "utf8");
  await fs.writeFile(
    path.join(runDir, "results.json"),
    JSON.stringify({ at: new Date().toISOString(), centre: org.name, examples: examplesOn, fx, runs, papers: byModel }, null, 2),
    "utf8"
  );
  console.log(`\nFull report: ${path.join(runDir, "report.md")}`);
}

// ===========================================================================

/**
 * Papers a tutor has signed off, with everything needed to re-mark them.
 *
 * Each paper's own worked examples are left out of its prompt. Reviewing a
 * paper writes examples *from that paper*, so leaving them in would show the
 * model the tutor's answer to the very question it is being tested on.
 */
async function loadAnswerKey(organisationId) {
  const rows = await prisma.submission.findMany({
    where: {
      organisationId,
      status: "REVIEWED",
      pageUrls: { isEmpty: false },
      ...(args.scheme ? { markSchemeId: args.scheme } : {}),
      ...(args["from-scratch-only"] ? { model: null } : {}),
    },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    include: { marks: true, markScheme: { include: { questions: { orderBy: { order: "asc" } } } } },
  });

  const examplesByScheme = new Map();
  const papers = [];
  for (const row of rows) {
    const key = row.marks
      .filter((m) => m.source === "HUMAN" && m.available > 0)
      .map((m) => ({ label: m.label, awarded: m.awarded, available: m.available, transcript: m.transcript }));
    if (key.length === 0) continue;

    let pages;
    try {
      pages = [];
      for (const url of row.pageUrls) {
        const { bytes, contentType } = await readUpload(url);
        const mediaType = MEDIA_TYPES[contentType.split(";")[0].trim().toLowerCase()];
        if (!mediaType) throw new Error(`unsupported image type ${contentType}`);
        pages.push({ data: bytes.toString("base64"), mediaType });
      }
    } catch (err) {
      console.warn(`  skipping ${shortId(row.id)}: its photographs couldn't be read (${err instanceof Error ? err.message : err})`);
      continue;
    }

    if (!examplesByScheme.has(row.markSchemeId)) {
      examplesByScheme.set(
        row.markSchemeId,
        await prisma.markingExample.findMany({ where: { markSchemeId: row.markSchemeId }, orderBy: [{ source: "asc" }, { createdAt: "desc" }] })
      );
    }
    // In JavaScript, not SQL: `submissionId <> x` in SQL would also drop every
    // example with no submission — the ones imported from a brain vault.
    const examples = examplesOn
      ? examplesByScheme
          .get(row.markSchemeId)
          .filter((e) => e.submissionId !== row.id)
          .map((e) => ({
            questionId: e.questionId,
            studentAnswer: e.studentAnswer,
            awarded: e.awarded,
            available: e.available,
            examinerComment: e.examinerComment,
            source: e.source,
            createdAt: e.createdAt,
          }))
      : [];

    papers.push({
      id: row.id,
      scheme: row.markScheme.title,
      markedFirstBy: row.model,
      key,
      available: key.reduce((n, k) => n + k.available, 0),
      input: {
        schemeTitle: row.markScheme.title,
        subject: row.markScheme.subject,
        level: row.markScheme.level,
        questions: row.markScheme.questions.map((q) => ({
          id: q.id,
          label: q.label,
          order: q.order,
          prompt: q.prompt,
          expectedAnswer: q.expectedAnswer,
          marks: q.marks,
          guidance: q.guidance,
        })),
        examples,
        pages,
      },
    });
  }
  return papers;
}

/** Everything that decides a model's reply. Change any of it and the cache misses, as it should. */
function requestHash(model, paper) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ v: CACHE_VERSION, model, local: model.startsWith("local:") ? process.env.LOCAL_RESPONSE_FORMAT ?? "json_object" : null }));
  h.update(SYSTEM_PROMPT);
  h.update(
    buildSchemeContext({
      schemeTitle: paper.input.schemeTitle,
      subject: paper.input.subject,
      level: paper.input.level,
      questions: paper.input.questions,
      examples: paper.input.examples,
    })
  );
  h.update(buildPaperInstruction(paper.input.pages.length));
  for (const p of paper.input.pages) h.update(createHash("sha256").update(p.data).digest("hex"));
  return h.digest("hex");
}

const cachePath = (model, hash) => path.join(outDir, "cache", model.replace(/[^\w.-]+/g, "_"), `${hash}.json`);

async function readCache(model, hash) {
  try {
    return JSON.parse(await fs.readFile(cachePath(model, hash), "utf8"));
  } catch (err) {
    // Only "not cached yet" is a miss. Swallowing everything once hid a bug
    // that made every paper look uncached.
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function writeCache(model, hash, value) {
  const file = cachePath(model, hash);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), "utf8");
}

/**
 * An upper bound, deliberately: every page at the largest image size any of
 * these providers bills, no cache discount, and a generous allowance for
 * thinking. The real bill should come in under it.
 */
function estimateUsd(model, paper) {
  const text = SYSTEM_PROMPT.length + buildSchemeContext(paper.input).length;
  const input = Math.ceil(text / 3.5) + paper.input.pages.length * 4800;
  const output = paper.key.length * 80 + 400 + 4000;
  return costUsd(model, { input, cacheRead: 0, cacheWrite: 0, output }) ?? 0;
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

// ---- Formatting -----------------------------------------------------------

function gbp(usd) {
  const pounds = usd * fx;
  if (pounds === 0) return "£0";
  if (pounds < 1) return `${(pounds * 100).toFixed(pounds * 100 < 1 ? 2 : 1)}p`;
  return `£${pounds.toFixed(2)}`;
}

const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const shortId = (id) => id.slice(-6);

function printAnswerKey(papers) {
  const bySchemeCount = {};
  for (const p of papers) bySchemeCount[p.scheme] = (bySchemeCount[p.scheme] ?? 0) + 1;
  const fromScratch = papers.filter((p) => !p.markedFirstBy).length;
  const byModel = {};
  for (const p of papers.filter((p) => p.markedFirstBy)) byModel[p.markedFirstBy] = (byModel[p.markedFirstBy] ?? 0) + 1;

  console.log(`Answer key: ${papers.length} paper${papers.length === 1 ? "" : "s"} marked by a tutor`);
  for (const [scheme, n] of Object.entries(bySchemeCount)) console.log(`  ${scheme}: ${n}`);
  console.log(`  ${fromScratch} marked from scratch by a person${Object.keys(byModel).length ? `, ${Object.entries(byModel).map(([m, n]) => `${n} checked after ${m} had marked them`).join(", ")}` : ""}`);
  if (Object.keys(byModel).length) {
    console.log(
      "  Note: a tutor confirming a model's mark is not the same as reaching it independently, so papers\n" +
        "  checked after a model marked them lean towards that model. Once you have enough, re-run with\n" +
        "  --from-scratch-only for the fairest comparison."
    );
  }
  if (papers.length < 10) console.log(`  With only ${papers.length} papers these results are mostly noise. Aim for 20–30, including messy ones.`);
  else if (papers.length < 30) console.log(`  ${papers.length} papers is enough for a guide, not a verdict.`);
  console.log(`Worked examples: ${examplesOn ? "on — each paper's own examples are left out, so no model sees the tutor's answer" : "off — every model marks cold"}`);
}

function printPlan(plan) {
  console.log("\nModels:");
  const w = Math.max(...plan.map((p) => p.model.length));
  for (const p of plan) {
    const status = !p.ready
      ? `skipped — set ${KEY_NAMES[p.provider]}`
      : `ready · ${p.cached ? `${p.cached} cached · ` : ""}${p.estimate > 0 ? `up to about ${gbp(p.estimate)}` : "nothing to spend"}${!ratesFor(p.model) && !p.model.startsWith("local:") ? " (price not in the rates table — cost will show as ?)" : ""}`;
    console.log(`  ${p.model.padEnd(w)}  ${p.provider.padEnd(9)}  ${status}`);
  }
}

function resultsTable(runs) {
  const header = ["Model", "Marks right", "Within 1", "Wrong & unchecked", "Papers to a person", "Reading", "Failed", "Time/paper", "Cost/paper", "Per 1,000"];
  const rows = Object.entries(runs).map(([model, r]) => [
    model,
    pct(r.summary.marksRight),
    pct(r.summary.marksWithinOne),
    pct(r.summary.wrongAndUnchecked),
    pct(r.summary.papersToPerson),
    pct(r.summary.reading),
    `${r.summary.failedPapers}/${r.summary.papers}`,
    `${r.secondsPerPaper.toFixed(1)}s`,
    r.costPerPaper === null || !r.priceKnown ? "?" : gbp(r.costPerPaper),
    r.costPerPaper === null || !r.priceKnown ? "?" : gbp(r.costPerPaper * 1000),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => "| " + cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join(" | ") + " |";
  // Markdown alignment row: model names left, numbers right.
  const rule = "|" + widths.map((w, i) => (i === 0 ? ":" + "-".repeat(w + 1) : "-".repeat(w + 1) + ":")).join("|") + "|";
  return [line(header), rule, ...rows.map(line)].join("\n");
}

function howToRead() {
  return [
    "",
    "How to read this:",
    "  Wrong & unchecked   the one that matters most — wrong marks on papers the model was confident",
    "                      enough to send out without a person looking. Lower is better.",
    "  Papers to a person  tutor workload: papers the model sent for checking, or couldn't mark at all.",
    "  Marks right         questions where the model's mark matched the tutor's exactly.",
    "  Reading             how closely its transcript of the handwriting matched the tutor's.",
    `  Cost                list prices checked ${Object.values(ratesForAll()).sort().at(-1) ?? "—"}, at $1 = £${fx} (${FX_CHECKED}). Local models show £0: hardware and power aren't counted.`,
  ].join("\n");
}

function ratesForAll() {
  return Object.fromEntries(models.map((m) => [m, ratesFor(m)?.checked]).filter(([, d]) => d));
}

function renderReport(org, papers, runs, byModel, table) {
  const scheme = Object.fromEntries(papers.map((p) => [p.id, p.scheme]));
  const keyById = Object.fromEntries(papers.map((p) => [p.id, p.key]));
  const fromScratch = papers.filter((p) => !p.markedFirstBy).length;
  const truncate = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  const lines = [
    `# Marking bench — ${org.name}`,
    "",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${papers.length} papers · worked examples ${examplesOn ? "on" : "off"}`,
    "",
    `Answer key: ${papers.length} papers marked by a tutor — ${fromScratch} from scratch, ${papers.length - fromScratch} checked after a model had marked them.`,
    papers.length - fromScratch > 0
      ? "Papers checked after a model marked them lean towards that model. Re-run with `--from-scratch-only` once there are enough."
      : "",
    papers.length < 30 ? `${papers.length} papers is ${papers.length < 10 ? "mostly noise" : "a guide, not a verdict"}. Aim for 20–30, including messy ones.` : "",
    "",
    "## Results",
    "",
    table,
    "",
    "**Wrong & unchecked** is the number that matters: wrong marks on papers the model was confident enough to send out without anyone looking. **Papers to a person** is tutor workload. **Reading** is how closely the model's transcript matched the tutor's.",
    "",
    "## Questions most models got wrong",
    "",
    "When every model disagrees with the tutor on the same question, look at the question before the models: the mark scheme's guidance may be thin, or the tutor's mark may be the odd one out.",
    "",
    "| Paper | Scheme | Q | Tutor | Wrong in | Tutor read |",
    "|---|---|---|---|---|---|",
    ...hardestQuestions(byModel).map((h) => {
      const k = keyById[h.paperId]?.find((x) => x.label === h.label);
      return `| ${shortId(h.paperId)} | ${scheme[h.paperId]} | ${h.label} | ${h.tutor}/${h.available} | ${h.wrongIn} of ${h.of} models | ${truncate((k?.transcript ?? "").replace(/\n/g, " ").replace(/\|/g, "/"))} |`;
    }),
  ];

  for (const [model, scores] of Object.entries(byModel)) {
    const misses = scores
      .flatMap((p) => p.questions.filter((q) => !q.right).map((q) => ({ ...q, paperId: p.paperId, unchecked: !p.toPerson })))
      .sort((a, b) => Number(b.unchecked) - Number(a.unchecked))
      .slice(0, 8);
    const failures = scores.filter((p) => p.failed);
    lines.push("", `## ${model}`, "");
    if (failures.length) {
      lines.push(`${failures.length} paper${failures.length === 1 ? "" : "s"} failed:`, ...failures.map((f) => `- ${shortId(f.paperId)}: ${f.failure}`), "");
    }
    if (misses.length === 0) {
      lines.push("Agreed with the tutor on every question.");
      continue;
    }
    lines.push(
      "Where it disagreed with the tutor (unchecked ones first):",
      "",
      "| Paper | Q | Tutor | Model | Unchecked | Tutor read | Model read |",
      "|---|---|---|---|---|---|---|",
      ...misses.map(
        (q) =>
          `| ${shortId(q.paperId)} | ${q.label} | ${q.tutor}/${q.available} | ${q.model ?? "—"}/${q.available} | ${q.unchecked ? "**yes**" : "no"} | ${truncate(q.tutorTranscript.replace(/\n/g, " ").replace(/\|/g, "/"), 40)} | ${truncate((q.modelTranscript ?? "").replace(/\n/g, " ").replace(/\|/g, "/"), 40)} |`
      )
    );
  }

  lines.push(
    "",
    "---",
    "",
    `Costs are list prices from \`src/lib/bench/rates.ts\` at $1 = £${fx}; confirm before quoting them. Local models show £0 — the hardware and electricity aren't counted. This report contains children's answers: keep it on the centre's machine.`
  );
  return lines.filter((l) => l !== undefined).join("\n") + "\n";
}

// Run last, so every helper above is defined before anything calls it.
try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
