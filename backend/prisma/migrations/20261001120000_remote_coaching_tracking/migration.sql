-- Create-only migration: apply through the normal CRM migration workflow.
-- Legacy rows remain readable and are not automatically submitted to the API.
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "remoteManaged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remoteAnalysisId" INTEGER,
  ADD COLUMN "remoteRequestKey" TEXT,
  ADD COLUMN "remoteRelaunch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remoteSyncAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "remoteNextSyncAt" TIMESTAMP(3),
  ADD COLUMN "remoteLeaseToken" TEXT,
  ADD COLUMN "remoteLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "remoteSyncError" TEXT,
  ADD COLUMN "remotePlanSnapshot" JSONB,
  ADD COLUMN "remoteResultSnapshot" JSONB;
CREATE INDEX "CoachingAnalysis_remoteManaged_remoteNextSyncAt_idx"
  ON "CoachingAnalysis"("remoteManaged", "remoteNextSyncAt");
