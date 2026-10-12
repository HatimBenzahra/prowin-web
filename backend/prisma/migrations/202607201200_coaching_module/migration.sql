-- CreateEnum
CREATE TYPE "CoachingStatus" AS ENUM ('PENDING', 'TRANSCRIBING', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CoachingQuality" AS ENUM ('ANALYZED', 'LOW_CONFIDENCE', 'INEXPLOITABLE', 'FAILED');

-- CreateTable
CREATE TABLE "SalesPlanVersion" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "rawMarkdown" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingAnalysis" (
    "id" SERIAL NOT NULL,
    "recordingId" INTEGER NOT NULL,
    "porteId" INTEGER,
    "commercialId" INTEGER,
    "managerId" INTEGER,
    "s3KeyOriginal" TEXT NOT NULL,
    "statutPorte" "StatutPorte",
    "salesPlanVersionId" INTEGER NOT NULL,
    "status" "CoachingStatus" NOT NULL DEFAULT 'PENDING',
    "quality" "CoachingQuality",
    "score" DOUBLE PRECISION,
    "subScores" JSONB,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "strengths" JSONB,
    "improvements" JSONB,
    "recommendations" JSONB,
    "criterionResults" JSONB,
    "transcript" TEXT,
    "transcriptDurationSec" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlanVersion_contentHash_key" ON "SalesPlanVersion"("contentHash");

-- CreateIndex
CREATE INDEX "SalesPlanVersion_slug_isActive_idx" ON "SalesPlanVersion"("slug", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPlanVersion_slug_version_key" ON "SalesPlanVersion"("slug", "version");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_status_idx" ON "CoachingAnalysis"("status");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_commercialId_idx" ON "CoachingAnalysis"("commercialId");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_managerId_idx" ON "CoachingAnalysis"("managerId");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_porteId_idx" ON "CoachingAnalysis"("porteId");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_recordingId_idx" ON "CoachingAnalysis"("recordingId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingAnalysis_s3KeyOriginal_salesPlanVersionId_key" ON "CoachingAnalysis"("s3KeyOriginal", "salesPlanVersionId");

-- AddForeignKey
ALTER TABLE "CoachingAnalysis" ADD CONSTRAINT "CoachingAnalysis_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAnalysis" ADD CONSTRAINT "CoachingAnalysis_porteId_fkey" FOREIGN KEY ("porteId") REFERENCES "Porte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAnalysis" ADD CONSTRAINT "CoachingAnalysis_salesPlanVersionId_fkey" FOREIGN KEY ("salesPlanVersionId") REFERENCES "SalesPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

