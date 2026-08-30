-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'HEAD_OFFICE', 'REGIONAL_MANAGER', 'FRANCHISEE', 'CENTRE_HEAD', 'INSPECTOR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "CentreSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "CentreStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "InspectionQuestionType" AS ENUM ('RATING', 'YESNO', 'SCALE', 'NUMBER', 'CHOICE');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('WELL', 'IMPROVE', 'OBS', 'SKIP');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'DONE', 'MISSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'INSPECTOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Centre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" "CentreStatus" NOT NULL DEFAULT 'OPEN',
    "size" "CentreSize",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Centre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "InspectionQuestionType" NOT NULL DEFAULT 'RATING',
    "order" INTEGER NOT NULL,
    "options" JSONB,
    "minVal" INTEGER,
    "maxVal" INTEGER,
    "unit" TEXT,
    "scored" BOOLEAN NOT NULL DEFAULT false,
    "requireNote" BOOLEAN NOT NULL DEFAULT false,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "photoExempt" BOOLEAN NOT NULL DEFAULT false,
    "allowNA" BOOLEAN NOT NULL DEFAULT false,
    "whoField" BOOLEAN NOT NULL DEFAULT false,
    "guide" TEXT,
    "dos" JSONB,
    "donts" JSONB,
    "sizeGuide" JSONB,
    "minBySize" JSONB,
    "tallyKey" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "size" "CentreSize" NOT NULL,
    "date" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "scorePct" INTEGER,
    "verdict" TEXT,
    "targets" TEXT,
    "debriefRole" TEXT,
    "debriefName" TEXT,
    "debriefNotes" TEXT,
    "debriefFeedback" TEXT,
    "debriefEmail" TEXT,
    "debriefSignatureUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answer" TEXT,
    "scoreFraction" DOUBLE PRECISION,
    "bucket" "Bucket",

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "note" TEXT,
    "who" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledVisit" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "inspectionId" TEXT,
    "statusReason" TEXT,
    "statusSetById" TEXT,
    "statusSetAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDelivery" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CentreManagers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CentreInspectors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Centre_name_key" ON "Centre"("name");

-- CreateIndex
CREATE INDEX "Centre_status_sortOrder_idx" ON "Centre"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "Template_isActive_idx" ON "Template"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_version_key" ON "Template"("name", "version");

-- CreateIndex
CREATE INDEX "Section_templateId_idx" ON "Section"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_templateId_order_key" ON "Section"("templateId", "order");

-- CreateIndex
CREATE INDEX "Question_sectionId_idx" ON "Question"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_sectionId_order_key" ON "Question"("sectionId", "order");

-- CreateIndex
CREATE INDEX "Inspection_centreId_date_idx" ON "Inspection"("centreId", "date");

-- CreateIndex
CREATE INDEX "Inspection_inspectorId_idx" ON "Inspection"("inspectorId");

-- CreateIndex
CREATE INDEX "Inspection_status_idx" ON "Inspection"("status");

-- CreateIndex
CREATE INDEX "Answer_inspectionId_idx" ON "Answer"("inspectionId");

-- CreateIndex
CREATE INDEX "Answer_questionText_bucket_idx" ON "Answer"("questionText", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_inspectionId_questionId_key" ON "Answer"("inspectionId", "questionId");

-- CreateIndex
CREATE INDEX "Entry_answerId_idx" ON "Entry"("answerId");

-- CreateIndex
CREATE INDEX "Photo_entryId_idx" ON "Photo"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledVisit_inspectionId_key" ON "ScheduledVisit"("inspectionId");

-- CreateIndex
CREATE INDEX "ScheduledVisit_inspectorId_date_idx" ON "ScheduledVisit"("inspectorId", "date");

-- CreateIndex
CREATE INDEX "ScheduledVisit_date_status_idx" ON "ScheduledVisit"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledVisit_centreId_inspectorId_date_key" ON "ScheduledVisit"("centreId", "inspectorId", "date");

-- CreateIndex
CREATE INDEX "ReportDelivery_userId_readAt_idx" ON "ReportDelivery"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDelivery_inspectionId_userId_key" ON "ReportDelivery"("inspectionId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "_CentreManagers_AB_unique" ON "_CentreManagers"("A", "B");

-- CreateIndex
CREATE INDEX "_CentreManagers_B_index" ON "_CentreManagers"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CentreInspectors_AB_unique" ON "_CentreInspectors"("A", "B");

-- CreateIndex
CREATE INDEX "_CentreInspectors_B_index" ON "_CentreInspectors"("B");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledVisit" ADD CONSTRAINT "ScheduledVisit_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledVisit" ADD CONSTRAINT "ScheduledVisit_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledVisit" ADD CONSTRAINT "ScheduledVisit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledVisit" ADD CONSTRAINT "ScheduledVisit_statusSetById_fkey" FOREIGN KEY ("statusSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledVisit" ADD CONSTRAINT "ScheduledVisit_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CentreManagers" ADD CONSTRAINT "_CentreManagers_A_fkey" FOREIGN KEY ("A") REFERENCES "Centre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CentreManagers" ADD CONSTRAINT "_CentreManagers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CentreInspectors" ADD CONSTRAINT "_CentreInspectors_A_fkey" FOREIGN KEY ("A") REFERENCES "Centre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CentreInspectors" ADD CONSTRAINT "_CentreInspectors_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

