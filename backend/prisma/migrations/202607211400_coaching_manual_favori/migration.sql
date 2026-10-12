-- Lancement manuel du coaching (ignore le gating durée) + porte favorite.
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Porte"
  ADD COLUMN "coachingFavori" BOOLEAN NOT NULL DEFAULT false;
