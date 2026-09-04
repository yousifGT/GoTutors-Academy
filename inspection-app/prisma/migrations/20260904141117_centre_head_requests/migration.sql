-- CreateEnum
CREATE TYPE "HeadRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "CentreHeadRequest" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "headId" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "note" TEXT,
    "status" "HeadRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreHeadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CentreHeadRequest_status_createdAt_idx" ON "CentreHeadRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CentreHeadRequest_centreId_idx" ON "CentreHeadRequest"("centreId");

-- AddForeignKey
ALTER TABLE "CentreHeadRequest" ADD CONSTRAINT "CentreHeadRequest_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Centre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreHeadRequest" ADD CONSTRAINT "CentreHeadRequest_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreHeadRequest" ADD CONSTRAINT "CentreHeadRequest_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreHeadRequest" ADD CONSTRAINT "CentreHeadRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
