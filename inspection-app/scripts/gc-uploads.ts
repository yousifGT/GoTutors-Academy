/**
 * Delete stored images nothing points at any more.
 *
 * Two ways an object is left behind:
 *   - it was uploaded and never attached, because the inspection was abandoned
 *     between taking the photo and the autosave;
 *   - it was attached and then removed, or its inspection was deleted, and the
 *     Photo row went with it.
 *
 * Neither is harmless. These are photographs taken inside a children's setting,
 * and one that belongs to no inspection has no reason to exist and nobody
 * reviewing it. Run this on a schedule.
 *
 *   npm run uploads:gc            # report only
 *   npm run uploads:gc -- --apply # delete
 *   npm run uploads:gc -- --apply --older-than 7
 *
 * The grace period matters: an upload made in the last few minutes is very
 * likely a photo whose autosave has not landed yet, and deleting it would take
 * an image out of an inspection in progress. The default is a day.
 */
import { PrismaClient } from "@prisma/client";
import { deleteUpload, hrefsForKey } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const days = Number(args[args.indexOf("--older-than") + 1]);
  const graceDays = args.includes("--older-than") && Number.isFinite(days) && days >= 0 ? days : 1;
  const cutoff = new Date(Date.now() - graceDays * 86_400_000);

  const candidates = await prisma.upload.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { key: true, backend: true, bytes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const orphans: typeof candidates = [];
  for (const up of candidates) {
    const urls = hrefsForKey(up.key);
    const [photo, signature] = await Promise.all([
      prisma.photo.findFirst({ where: { url: { in: urls } }, select: { id: true } }),
      prisma.inspection.findFirst({ where: { debriefSignatureUrl: { in: urls } }, select: { id: true } }),
    ]);
    if (!photo && !signature) orphans.push(up);
  }

  const bytes = orphans.reduce((n, o) => n + o.bytes, 0);
  console.log(
    `${candidates.length} upload(s) older than ${graceDays} day(s); ` +
      `${orphans.length} attached to nothing (${(bytes / 1024 / 1024).toFixed(1)} MB)`
  );

  if (!orphans.length) return;
  if (!apply) {
    console.log("Dry run. Re-run with --apply to delete.");
    for (const o of orphans.slice(0, 20)) console.log(`  ${o.key}  ${o.createdAt.toISOString()}`);
    if (orphans.length > 20) console.log(`  … and ${orphans.length - 20} more`);
    return;
  }

  let removed = 0;
  for (const o of orphans) {
    // Object first: a deleted row with the object still in the bucket is an
    // image nothing will ever come back for, which is the case this exists to
    // prevent. The reverse — object gone, row left — is fixed on the next run.
    await deleteUpload(o.key, o.backend === "s3" ? "s3" : "local");
    await prisma.upload.delete({ where: { key: o.key } });
    removed++;
  }
  console.log(`Deleted ${removed} object(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
