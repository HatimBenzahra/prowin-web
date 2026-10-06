ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "transcriptMetadata" JSONB,
  ADD COLUMN "transcriptionAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "evaluationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stageStartedAt" TIMESTAMP(3),
  ADD COLUMN "transcriptionStartedAt" TIMESTAMP(3),
  ADD COLUMN "transcriptionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "evaluationStartedAt" TIMESTAMP(3),
  ADD COLUMN "evaluationCompletedAt" TIMESTAMP(3);
