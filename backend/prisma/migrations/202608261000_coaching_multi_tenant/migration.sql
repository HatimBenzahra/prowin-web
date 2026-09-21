-- Le coaching devient multi-organisation.
--
-- Jusqu'ici il servait un seul referentiel : un plan de vente actif, des fiches
-- produit actives, les memes pour tout le monde. Une organisation qui importe son
-- propre plan a besoin que "actif" veuille dire "actif chez elle".
--
-- `tenantId` vaut la chaine vide pour tout l'existant, et non NULL : les contraintes
-- d'unicite ci-dessous portent dessus, or en SQL NULL n'est jamais egal a NULL — deux
-- doublons a tenant NULL passeraient tous les deux, et l'idempotence du moteur
-- (1 analyse par audio x version de plan) sauterait sans bruit.
--
-- Le CRM v1 n'a pas de tenant : il garde la chaine vide et ne voit aucune difference.

ALTER TABLE "SalesPlanVersion"
  ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ProductSheetVersion"
  ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '';

-- `externalUserRef` / `externalPorteRef` : les memes references, telles que l'appelant
-- les nomme. `userId` et `porteId` sont des cles etrangeres du CRM ; une app qui
-- identifie ses commerciaux par UUID ne peut rien y mettre.
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "externalUserRef" TEXT,
  ADD COLUMN "externalPorteRef" TEXT;

-- ── SalesPlanVersion : l'unicite devient locale au tenant ────────────────────────
DROP INDEX IF EXISTS "SalesPlanVersion_contentHash_key";
DROP INDEX IF EXISTS "SalesPlanVersion_slug_version_key";
DROP INDEX IF EXISTS "SalesPlanVersion_slug_isActive_idx";

CREATE UNIQUE INDEX "SalesPlanVersion_tenantId_contentHash_key"
  ON "SalesPlanVersion"("tenantId", "contentHash");
CREATE UNIQUE INDEX "SalesPlanVersion_tenantId_slug_version_key"
  ON "SalesPlanVersion"("tenantId", "slug", "version");
CREATE INDEX "SalesPlanVersion_tenantId_slug_isActive_idx"
  ON "SalesPlanVersion"("tenantId", "slug", "isActive");

-- ── ProductSheetVersion : idem ──────────────────────────────────────────────────
DROP INDEX IF EXISTS "ProductSheetVersion_contentHash_key";
DROP INDEX IF EXISTS "ProductSheetVersion_slug_version_key";
DROP INDEX IF EXISTS "ProductSheetVersion_slug_isActive_idx";
DROP INDEX IF EXISTS "ProductSheetVersion_productKey_isActive_idx";

CREATE UNIQUE INDEX "ProductSheetVersion_tenantId_contentHash_key"
  ON "ProductSheetVersion"("tenantId", "contentHash");
CREATE UNIQUE INDEX "ProductSheetVersion_tenantId_slug_version_key"
  ON "ProductSheetVersion"("tenantId", "slug", "version");
CREATE INDEX "ProductSheetVersion_tenantId_slug_isActive_idx"
  ON "ProductSheetVersion"("tenantId", "slug", "isActive");
CREATE INDEX "ProductSheetVersion_tenantId_productKey_isActive_idx"
  ON "ProductSheetVersion"("tenantId", "productKey", "isActive");

-- ── CoachingAnalysis : l'idempotence devient locale a l'appelant ────────────────
-- Deux organisations qui analysent le meme audio contre leur propre plan produisent
-- deux jugements distincts. Le nom de l'index est explicite : le nom derive par defaut
-- depasse les 63 caracteres de Postgres.
DROP INDEX IF EXISTS "CoachingAnalysis_s3KeyOriginal_salesPlanVersionId_key";
DROP INDEX IF EXISTS "CoachingAnalysis_source_idx";

CREATE UNIQUE INDEX "CoachingAnalysis_appelant_audio_plan_key"
  ON "CoachingAnalysis"("source", "tenantId", "s3KeyOriginal", "salesPlanVersionId");
CREATE INDEX "CoachingAnalysis_source_tenantId_idx"
  ON "CoachingAnalysis"("source", "tenantId");
CREATE INDEX "CoachingAnalysis_externalUserRef_idx"
  ON "CoachingAnalysis"("externalUserRef");
