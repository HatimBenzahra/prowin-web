-- Durée minimale (secondes) d'un audio pour déclencher l'analyse AUTO (configurable).
ALTER TABLE "CoachingConfig"
  ADD COLUMN "minAutoDurationSec" INTEGER NOT NULL DEFAULT 120;
