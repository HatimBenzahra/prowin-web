-- Queue coaching : compteur de tentatives + prochaine tentative (backoff)
ALTER TABLE "CoachingAnalysis" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CoachingAnalysis" ADD COLUMN "nextRetryAt" TIMESTAMP(3);

-- Config singleton du coaching (statuts coachables, éditable via UI)
CREATE TABLE "CoachingConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "coachableStatuts" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingConfig_pkey" PRIMARY KEY ("id")
);
