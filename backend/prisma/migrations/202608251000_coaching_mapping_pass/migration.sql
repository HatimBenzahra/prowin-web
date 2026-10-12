-- Passe 0 (mapping des offres) : la détection sort du prompt de jugement pour
-- devenir un appel dédié, à liste fermée. Elle précède les passes 1 et 2, qui
-- tournent désormais en parallèle — d'où un nouvel état, et CONFORMITY qui n'est
-- plus jamais écrit (conservé : des lignes antérieures le portent).
ALTER TYPE "CoachingStatus" ADD VALUE 'MAPPING' BEFORE 'ANALYZING';

-- Signaux de reconnaissance de l'offre, injectés dans le prompt de mapping.
-- Défaut '[]' : les versions de fiche déjà en base n'en portent pas ; les fiches
-- rechargées au boot (sha256 modifié) créeront de nouvelles versions avec.
ALTER TABLE "ProductSheetVersion"
  ADD COLUMN "identifiers" JSONB NOT NULL DEFAULT '[]';

-- Trace complète de la passe 0, offres vues mais non présentées incluses : sans
-- elle, un « il a raté l'offre » reste indiagnosticable après coup.
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "productMapping" JSONB;
