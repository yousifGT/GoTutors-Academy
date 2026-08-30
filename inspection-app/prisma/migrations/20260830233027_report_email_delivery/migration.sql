-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "ReportDelivery" ADD COLUMN     "emailAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailNextAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "emailTo" TEXT,
ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ReportDelivery_emailStatus_emailNextAt_idx" ON "ReportDelivery"("emailStatus", "emailNextAt");

-- Rows that already exist predate emailing entirely. Left at the PENDING
-- default, the first run of the sender would mail every centre head about every
-- inspection ever recorded — months of history, all at once, from an address
-- they have never seen. They were delivered in the app when they happened;
-- that is what they get.
UPDATE "ReportDelivery" SET "emailStatus" = 'SKIPPED', "emailError" = 'predates email delivery';
