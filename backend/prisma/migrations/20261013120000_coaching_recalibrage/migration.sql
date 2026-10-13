-- Recalibrage coaching 2026 : migration additive, colonnes nullables ou à défaut.

-- CreateEnum
CREATE TYPE "CommercialNiveau" AS ENUM ('EN_FORMATION', 'OPERATIONNEL', 'CONFIRME', 'EXPERT');

-- AlterTable
ALTER TABLE "Commercial" ADD COLUMN "niveau" "CommercialNiveau" NOT NULL DEFAULT 'OPERATIONNEL';

-- AlterTable
ALTER TABLE "CoachingReference" ADD COLUMN "effectiveFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "executionScore" DOUBLE PRECISION,
  ADD COLUMN "outcomeScore" DOUBLE PRECISION,
  ADD COLUMN "visitResult" TEXT,
  ADD COLUMN "nonSaleReason" TEXT,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "ribStatus" TEXT,
  ADD COLUMN "signatureStatus" TEXT,
  ADD COLUMN "productStatuses" JSONB,
  ADD COLUMN "indicators" JSONB,
  ADD COLUMN "band" TEXT,
  ADD COLUMN "analysisConfidence" JSONB,
  ADD COLUMN "calculationChecks" JSONB,
  ADD COLUMN "contradictions" JSONB,
  ADD COLUMN "phaseTiming" JSONB,
  ADD COLUMN "outcomeOverriddenBy" TEXT,
  ADD COLUMN "outcomeOverriddenAt" TIMESTAMP(3);
