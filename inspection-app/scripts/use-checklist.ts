/**
 * Which checklist version is live, and switching between them.
 *
 *   npm run checklist            list every version, marking the live one
 *   npm run checklist -- 13      make v13 live
 *
 * The seed refuses to import a version older than the one in the database,
 * because doing that silently would roll the standard every future inspection
 * is scored against back to an older one. This is the deliberate way to do it —
 * chiefly for getting back to the real checklist after trying the two-question
 * demo one, and as the rollback path if a published version turns out wrong.
 *
 * Nothing already recorded moves. Every inspection keeps pointing at the
 * version it was actually carried out under, so its report reads the same
 * whichever version is live now; this only decides what the NEXT inspection is
 * run against.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEMPLATE_NAME = "GoTutors Centre Inspection";

async function main() {
  const versions = await prisma.template.findMany({
    where: { name: TEMPLATE_NAME },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      isActive: true,
      createdAt: true,
      _count: { select: { inspections: true } },
      sections: { select: { _count: { select: { questions: true } } } },
    },
  });

  if (!versions.length) {
    console.log("No checklist in the database yet. Import one with: npm run db:seed");
    return;
  }

  const wanted = process.argv[2];

  if (!wanted) {
    console.log(`Checklist versions of "${TEMPLATE_NAME}":\n`);
    for (const v of versions) {
      const questions = v.sections.reduce((n, s) => n + s._count.questions, 0);
      console.log(
        `  ${v.isActive ? "→ live " : "       "}v${String(v.version).padEnd(4)} ` +
          `${String(v.sections.length).padStart(2)} sections, ${String(questions).padStart(3)} questions, ` +
          `${v._count.inspections} inspection${v._count.inspections === 1 ? "" : "s"} recorded`
      );
    }
    console.log(`\nSwitch with: npm run checklist -- <version>`);
    return;
  }

  const version = Number(wanted);
  if (!Number.isInteger(version)) {
    throw new Error(`"${wanted}" is not a version number. Run without arguments to see the list.`);
  }

  const target = versions.find((v) => v.version === version);
  if (!target) {
    throw new Error(
      `There is no v${version}. Available: ${versions.map((v) => `v${v.version}`).join(", ")}`
    );
  }
  if (target.isActive) {
    console.log(`v${version} is already the live checklist. Nothing to do.`);
    return;
  }

  // One live version, always. Both writes in a transaction so a failure cannot
  // leave the app with two live checklists or none.
  await prisma.$transaction([
    prisma.template.updateMany({ where: { name: TEMPLATE_NAME }, data: { isActive: false } }),
    prisma.template.update({ where: { id: target.id }, data: { isActive: true } }),
  ]);

  const questions = target.sections.reduce((n, s) => n + s._count.questions, 0);
  console.log(`v${version} is now live — ${target.sections.length} sections, ${questions} questions.`);
  console.log(`Inspections already recorded are untouched; this decides what the next one is run against.`);
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
