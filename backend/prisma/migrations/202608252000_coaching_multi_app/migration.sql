-- Le coaching devient consommable par plusieurs apps. Trois consequences :
--
-- 1. `source` identifie l'appelant. Elle est renseignee depuis la CLE D'API, jamais
--    depuis le corps de la requete : sinon n'importe qui se declare "prowin" et
--    ses analyses remontent dans la file, les stats et les bilans du CRM.
-- 2. `commercialId` devient `userId` : une app tierce n'a pas de "commercial".
-- 3. `recordingId` devient optionnel : elle n'a pas non plus d'enregistrement CRM.
ALTER TABLE "CoachingAnalysis" RENAME COLUMN "commercialId" TO "userId";

ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'prowin';

ALTER TABLE "CoachingAnalysis" ALTER COLUMN "recordingId" DROP NOT NULL;

ALTER INDEX IF EXISTS "CoachingAnalysis_commercialId_idx" RENAME TO "CoachingAnalysis_userId_idx";
CREATE INDEX IF NOT EXISTS "CoachingAnalysis_source_idx" ON "CoachingAnalysis"("source");
