#!/usr/bin/env node
/**
 * Load a marking brain from an Obsidian vault into this app's database.
 *
 *   npm run brain:import -- --dry-run                 # show what would change
 *   npm run brain:import                              # from ./brain-vault
 *   npm run brain:import -- --from ~/Obsidian/Work    # from an existing vault
 *
 * For restoring onto a new machine, moving to a fresh install, or bringing a
 * centre's learning across after a rebuild. It merges rather than replaces:
 *
 *  - a mark scheme is matched by title, and created if it isn't there;
 *  - a question is matched by its label, and created if it isn't there — an
 *    existing question's wording is never changed, because the app's copy is
 *    the one in use;
 *  - a worked example already present is skipped, so importing the same vault
 *    twice adds nothing the second time.
 *
 * Nothing is ever deleted.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseVault, VAULT_ROOT } from "../src/lib/brain/vault.ts";
import { parseArgs, resolveOrganisation } from "./cli.mjs";

const args = parseArgs(process.argv.slice(2), { from: "value", org: "value", "dry-run": "flag" });
const fromDir = path.resolve(args.from ?? "brain-vault");
const dryRun = !!args["dry-run"];
const prisma = new PrismaClient();

const exampleKey = (questionId, answer, awarded, comment) =>
  [questionId, answer.trim(), awarded, comment.trim()].join("\u0000");

try {
  const root = path.join(fromDir, VAULT_ROOT);
  const paths = await listMarkdown(root);
  if (paths.length === 0) throw new Error(`No "${VAULT_ROOT}" notes found in ${fromDir}`);
  const files = await Promise.all(
    paths.map(async (p) => ({ path: path.relative(fromDir, p), content: await fs.readFile(p, "utf8") }))
  );

  const { schemes, problems } = parseVault(files);
  for (const p of problems) console.warn(`  skipped ${p.path}: ${p.problem}`);

  const org = await resolveOrganisation(prisma, args.org);
  const owner = await prisma.user.findFirst({
    where: { organisationId: org.id, role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error(`${org.name} has no active admin to own imported mark schemes.`);

  const totals = { schemesCreated: 0, schemesMatched: 0, questionsCreated: 0, questionsMatched: 0, examplesAdded: 0, examplesSkipped: 0 };

  for (const vs of schemes) {
    const existing = await prisma.markScheme.findFirst({
      where: { organisationId: org.id, title: vs.title },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
      include: { questions: { include: { examples: true } } },
    });
    existing ? totals.schemesMatched++ : totals.schemesCreated++;

    // Work out the whole change for this scheme first, then apply it in one
    // transaction — a half-imported scheme is harder to reason about than
    // either none of it or all of it.
    const byLabel = new Map((existing?.questions ?? []).map((q) => [q.label.trim().toLowerCase(), q]));
    const plan = vs.questions.map((vq) => {
      const match = byLabel.get(vq.label.trim().toLowerCase()) ?? null;
      match ? totals.questionsMatched++ : totals.questionsCreated++;
      const known = new Set((match?.examples ?? []).map((e) => exampleKey(match.id, e.studentAnswer, e.awarded, e.examinerComment)));
      const fresh = vq.examples.filter((e) => !known.has(exampleKey(match?.id, e.studentAnswer, e.awarded, e.comment)));
      totals.examplesAdded += fresh.length;
      totals.examplesSkipped += vq.examples.length - fresh.length;
      return { vq, match, fresh };
    });

    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const scheme =
        existing ??
        (await tx.markScheme.create({
          data: {
            organisationId: org.id,
            ownerId: owner.id,
            title: vs.title,
            subject: vs.subject,
            level: vs.level,
            archived: vs.archived,
            shared: true,
          },
        }));

      for (const { vq, match, fresh } of plan) {
        const question =
          match ??
          (await tx.markSchemeQuestion.create({
            data: {
              markSchemeId: scheme.id,
              order: vq.order,
              label: vq.label,
              prompt: vq.prompt,
              expectedAnswer: vq.expectedAnswer,
              marks: vq.marks,
              guidance: vq.guidance,
            },
          }));
        if (fresh.length === 0) continue;
        await tx.markingExample.createMany({
          data: fresh.map((e) => ({
            markSchemeId: scheme.id,
            questionId: question.id,
            studentAnswer: e.studentAnswer,
            awarded: e.awarded,
            available: e.available,
            examinerComment: e.comment,
            source: e.source,
            createdAt: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? new Date(`${e.date}T12:00:00Z`) : new Date(),
          })),
        });
      }
    });
  }

  console.log(`${dryRun ? "Would import" : "Imported"} into ${org.name}:`);
  console.log(`  mark schemes: ${totals.schemesCreated} new, ${totals.schemesMatched} already here`);
  console.log(`  questions:    ${totals.questionsCreated} new, ${totals.questionsMatched} already here`);
  console.log(`  examples:     ${totals.examplesAdded} added, ${totals.examplesSkipped} already here`);
  if (dryRun) console.log("Dry run — nothing was changed.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function listMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}
