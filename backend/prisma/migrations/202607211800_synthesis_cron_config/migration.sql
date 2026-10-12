-- Planification configurable de la régénération auto des synthèses.
ALTER TABLE "CoachingConfig"
  ADD COLUMN "synthesisCronFrequency" TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN "synthesisCronHour" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "synthesisCronMinute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "synthesisCronWeekday" INTEGER NOT NULL DEFAULT 1;
