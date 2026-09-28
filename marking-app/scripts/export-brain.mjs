#!/usr/bin/env node
/**
 * Write everything the marker has learned into an Obsidian vault.
 *
 *   npm run brain:export                          # into ./brain-vault
 *   npm run brain:export -- --out ~/Obsidian/Work # into an existing vault
 *   npm run brain:export -- --org <id>            # when there is more than one centre
 *
 * Writes a "Marker Brain" folder: a Home note, one note per mark scheme, and one
 * per question holding every worked example a tutor checked or corrected. Safe
 * to run as often as you like — on a schedule, say. It only ever overwrites or
 * removes notes it wrote itself; anything else in the vault is left alone.
 *
 * The vault holds children's answers, with no names attached. Keep it on the
 * centre's own machine: don't turn on Obsidian Sync or iCloud for it.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderVault, isManagedNote, VAULT_ROOT } from "../src/lib/brain/vault.ts";
import { parseArgs, resolveOrganisation } from "./brain-args.mjs";

const args = parseArgs(process.argv.slice(2), { out: "value", org: "value" });
const outDir = path.resolve(args.out ?? "brain-vault");
const prisma = new PrismaClient();

try {
  const org = await resolveOrganisation(prisma, args.org);

  const rows = await prisma.markScheme.findMany({
    where: { organisationId: org.id },
    orderBy: [{ archived: "asc" }, { title: "asc" }],
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { examples: { orderBy: { createdAt: "desc" } } },
      },
    },
  });

  const schemes = rows.map((s) => ({
    title: s.title,
    subject: s.subject,
    level: s.level,
    archived: s.archived,
    questions: s.questions.map((q) => ({
      label: q.label,
      order: q.order,
      prompt: q.prompt,
      expectedAnswer: q.expectedAnswer,
      marks: q.marks,
      guidance: q.guidance,
      examples: q.examples.map((e) => ({
        studentAnswer: e.studentAnswer,
        awarded: e.awarded,
        available: e.available,
        comment: e.examinerComment,
        source: e.source,
        date: e.createdAt.toISOString().slice(0, 10),
      })),
    })),
  }));

  const files = renderVault(schemes, { centre: org.name, exportedAt: new Date() });

  let written = 0;
  let unchanged = 0;
  const keep = new Set();
  for (const file of files) {
    const target = path.join(outDir, file.path);
    keep.add(target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Skip identical notes, so a scheduled export doesn't make a backup tool or
    // Obsidian think every note changed every night.
    const existing = await fs.readFile(target, "utf8").catch(() => null);
    if (existing === file.content) {
      unchanged++;
      continue;
    }
    await fs.writeFile(target, file.content, "utf8");
    written++;
  }

  // Notes for schemes or questions that no longer exist. Only this exporter's
  // own notes are ever removed — a tutor's note saved in the same folder stays.
  let removed = 0;
  let foreign = 0;
  for (const file of await listMarkdown(path.join(outDir, VAULT_ROOT))) {
    if (keep.has(file)) continue;
    const content = await fs.readFile(file, "utf8");
    if (isManagedNote(content)) {
      await fs.unlink(file);
      removed++;
    } else {
      foreign++;
    }
  }

  const examples = schemes.reduce((n, s) => n + s.questions.reduce((m, q) => m + q.examples.length, 0), 0);
  console.log(`Exported ${org.name}: ${schemes.length} mark schemes, ${examples} worked examples`);
  console.log(`  ${written} notes written, ${unchanged} unchanged, ${removed} stale notes removed`);
  if (foreign > 0) console.log(`  ${foreign} notes of your own left untouched`);
  console.log(`  → ${path.join(outDir, VAULT_ROOT)}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function listMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}
