/**
 * Import the inspection checklist and centre list into the database.
 *
 *   npm run db:seed:inspection
 *
 * Source of truth is `inspection-app/data/gotutors-seed.json` — the app's own
 * "Export backup" shape. Re-running is safe: the template is keyed on
 * (name, version), so importing the same checklist version updates it in place
 * and a new `checklistVersion` publishes a new template beside the old one.
 * Inspections already recorded keep pointing at the version they were run
 * against, and each answer stores its own question text, so old reports stay
 * readable after the checklist moves on.
 *
 * Centres are matched by name and only created when missing — an existing
 * centre's details are never overwritten, so this is safe against a live LMS.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient, type InspectionQuestionType } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATE_NAME = "GoTutors Centre Inspection";

type SeedQuestion = {
  text: string;
  type?: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  scored?: boolean;
  requireNote?: boolean;
  critical?: boolean;
  photoExempt?: boolean;
  allowNA?: boolean;
  whoField?: boolean;
  guide?: string;
  dos?: string[];
  donts?: string[];
  sizeGuide?: Record<string, { text: string }>;
  minBySize?: Record<string, number>;
  tally?: string;
};

type SeedFile = {
  config: {
    checklistVersion: number;
    centres: string[];
    template: { title: string; items: SeedQuestion[] }[];
  };
};

const TYPE_MAP: Record<string, InspectionQuestionType> = {
  rating: "RATING",
  yesno: "YESNO",
  scale: "SCALE",
  number: "NUMBER",
  choice: "CHOICE",
};

/**
 * A nullable Json column. Prisma needs the explicit `Prisma.DbNull` sentinel to
 * write a SQL NULL — passing a plain `null` writes the JSON value `null`, and
 * passing `{ set: null }` writes that object verbatim.
 */
function json(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

async function main() {
  const file = path.join(__dirname, "..", "inspection-app", "data", "gotutors-seed.json");
  const seed = JSON.parse(readFileSync(file, "utf8")) as SeedFile;
  const { checklistVersion, centres, template } = seed.config;

  console.log(`Importing checklist v${checklistVersion} — ${template.length} sections, ${template.reduce((n, s) => n + s.items.length, 0)} questions`);

  // ── Template ───────────────────────────────────────────────────────────────
  // Replacing the sections wholesale keeps the import idempotent; the cascade
  // clears the old questions. Recorded inspections are untouched — their answers
  // hold their own snapshot of the question text.
  const tpl = await prisma.inspectionTemplate.upsert({
    where: { name_version: { name: TEMPLATE_NAME, version: checklistVersion } },
    update: { isActive: true },
    create: { name: TEMPLATE_NAME, version: checklistVersion, isActive: true },
  });
  await prisma.inspectionSection.deleteMany({ where: { templateId: tpl.id } });

  // Only one version of the checklist is the live one.
  await prisma.inspectionTemplate.updateMany({
    where: { name: TEMPLATE_NAME, id: { not: tpl.id } },
    data: { isActive: false },
  });

  for (const [si, section] of template.entries()) {
    await prisma.inspectionSection.create({
      data: {
        templateId: tpl.id,
        title: section.title,
        order: si,
        questions: {
          create: section.items.map((q, qi) => ({
            text: q.text,
            type: TYPE_MAP[q.type ?? "rating"] ?? "RATING",
            order: qi,
            options: json(q.options),
            minVal: q.min ?? null,
            maxVal: q.max ?? null,
            unit: q.unit ?? null,
            scored: q.scored ?? false,
            requireNote: q.requireNote ?? false,
            critical: q.critical ?? false,
            photoExempt: q.photoExempt ?? false,
            allowNA: q.allowNA ?? false,
            whoField: q.whoField ?? false,
            guide: q.guide ?? null,
            dos: json(q.dos),
            donts: json(q.donts),
            sizeGuide: json(q.sizeGuide),
            minBySize: json(q.minBySize),
            tallyKey: q.tally ?? null,
          })),
        },
      },
    });
  }

  // ── Centres ────────────────────────────────────────────────────────────────
  let created = 0;
  for (const name of centres) {
    const existing = await prisma.centre.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.centre.create({ data: { name } });
    created++;
  }

  const questionCount = await prisma.inspectionQuestion.count({
    where: { section: { templateId: tpl.id } },
  });
  console.log(`Template ${tpl.id} — ${questionCount} questions imported.`);
  console.log(`Centres: ${created} created, ${centres.length - created} already present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
