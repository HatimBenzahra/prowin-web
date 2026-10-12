-- Dernière exécution du cron nocturne de synthèse (affiché dans les Réglages).
ALTER TABLE "CoachingConfig" ADD COLUMN "synthesisCronLastRunAt" TIMESTAMP(3);
