-- Synthèse globale de coaching par commercial / manager (hors pipeline audio).
CREATE TABLE "CoachingSynthesis" (
  "id"           SERIAL NOT NULL,
  "subjectType"  TEXT NOT NULL,
  "subjectKey"   TEXT NOT NULL,
  "commercialId" INTEGER,
  "managerId"    INTEGER,
  "status"       "CoachingStatus" NOT NULL DEFAULT 'PENDING',
  "summary"      TEXT,
  "strengths"    JSONB,
  "improvements" JSONB,
  "priorities"   JSONB,
  "trend"        TEXT,
  "scoreMoyen"   DOUBLE PRECISION,
  "nbAnalyses"   INTEGER NOT NULL DEFAULT 0,
  "stats"        JSONB,
  "error"        TEXT,
  "generatedAt"  TIMESTAMP(3),
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachingSynthesis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingSynthesis_subjectKey_key" ON "CoachingSynthesis"("subjectKey");
CREATE INDEX "CoachingSynthesis_commercialId_idx" ON "CoachingSynthesis"("commercialId");
CREATE INDEX "CoachingSynthesis_managerId_idx" ON "CoachingSynthesis"("managerId");
