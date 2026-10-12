-- Conformité produit dans le coaching.
-- Règle : une affirmation n'est sanctionnée que si elle contredit la fiche produit
-- ET le plan de vente. Le malus est global, retiré du score après son calcul.

-- Fiches produit versionnées par sha256, même contrat que SalesPlanVersion.
CREATE TABLE "ProductSheetVersion" (
  "id"          SERIAL       NOT NULL,
  "slug"        TEXT         NOT NULL,
  "label"       TEXT         NOT NULL,
  "productKey"  TEXT         NOT NULL,
  "version"     INTEGER      NOT NULL,
  "contentHash" TEXT         NOT NULL,
  "facts"       JSONB        NOT NULL,
  "forbidden"   JSONB        NOT NULL,
  "winleadplus" JSONB,
  "rawMarkdown" TEXT         NOT NULL,
  "isActive"    BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductSheetVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSheetVersion_contentHash_key" ON "ProductSheetVersion"("contentHash");
CREATE UNIQUE INDEX "ProductSheetVersion_slug_version_key" ON "ProductSheetVersion"("slug", "version");
CREATE INDEX "ProductSheetVersion_slug_isActive_idx" ON "ProductSheetVersion"("slug", "isActive");
CREATE INDEX "ProductSheetVersion_productKey_isActive_idx" ON "ProductSheetVersion"("productKey", "isActive");

-- Résultat de la passe 2 sur l'analyse. "score" reste le score FINAL (après malus)
-- pour que les agrégats existants (scoreboard, synthèses, stats) restent justes.
ALTER TABLE "CoachingAnalysis"
  ADD COLUMN "scoreBeforeMalus"     DOUBLE PRECISION,
  ADD COLUMN "malus"                DOUBLE PRECISION,
  ADD COLUMN "violations"           JSONB,
  ADD COLUMN "detectedProducts"     JSONB,
  ADD COLUMN "productSheetVersions" JSONB;
