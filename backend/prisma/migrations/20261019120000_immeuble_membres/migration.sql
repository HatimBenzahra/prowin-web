-- Immeuble partagé entre commerciaux : membres d'un immeuble (accès, listes) et
-- auteur du dernier passage sur chaque porte (statistiques). Migration additive :
-- Immeuble.commercialId / managerId restent comme « créé par ».

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'IMMEUBLE_PARTAGE';

-- AlterTable
ALTER TABLE "Porte" ADD COLUMN     "dernierCommercialId" INTEGER,
ADD COLUMN     "dernierManagerId" INTEGER;

-- CreateTable
CREATE TABLE "ImmeubleMembre" (
    "id" SERIAL NOT NULL,
    "immeubleId" INTEGER NOT NULL,
    "commercialId" INTEGER,
    "managerId" INTEGER,
    "ajouteParId" INTEGER,
    "ajouteParType" "UserType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImmeubleMembre_pkey" PRIMARY KEY ("id")
);

-- Un membre est un commercial OU un manager, jamais les deux ni aucun
-- (contrainte SQL, non modélisable dans schema.prisma).
ALTER TABLE "ImmeubleMembre" ADD CONSTRAINT "ImmeubleMembre_un_acteur_check"
  CHECK (num_nonnulls("commercialId", "managerId") = 1);

-- CreateIndex
CREATE INDEX "ImmeubleMembre_commercialId_idx" ON "ImmeubleMembre"("commercialId");

-- CreateIndex
CREATE INDEX "ImmeubleMembre_managerId_idx" ON "ImmeubleMembre"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "ImmeubleMembre_immeubleId_commercialId_key" ON "ImmeubleMembre"("immeubleId", "commercialId");

-- CreateIndex
CREATE UNIQUE INDEX "ImmeubleMembre_immeubleId_managerId_key" ON "ImmeubleMembre"("immeubleId", "managerId");

-- CreateIndex
CREATE INDEX "Porte_dernierCommercialId_idx" ON "Porte"("dernierCommercialId");

-- CreateIndex
CREATE INDEX "Porte_dernierManagerId_idx" ON "Porte"("dernierManagerId");

-- AddForeignKey
ALTER TABLE "ImmeubleMembre" ADD CONSTRAINT "ImmeubleMembre_immeubleId_fkey" FOREIGN KEY ("immeubleId") REFERENCES "Immeuble"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmeubleMembre" ADD CONSTRAINT "ImmeubleMembre_commercialId_fkey" FOREIGN KEY ("commercialId") REFERENCES "Commercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImmeubleMembre" ADD CONSTRAINT "ImmeubleMembre_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Porte" ADD CONSTRAINT "Porte_dernierCommercialId_fkey" FOREIGN KEY ("dernierCommercialId") REFERENCES "Commercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Porte" ADD CONSTRAINT "Porte_dernierManagerId_fkey" FOREIGN KEY ("dernierManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill : le propriétaire actuel de chaque immeuble en devient membre.
INSERT INTO "ImmeubleMembre" ("immeubleId", "commercialId")
SELECT "id", "commercialId" FROM "Immeuble" WHERE "commercialId" IS NOT NULL;

INSERT INTO "ImmeubleMembre" ("immeubleId", "managerId")
SELECT "id", "managerId" FROM "Immeuble" WHERE "managerId" IS NOT NULL;

-- Backfill : auteur du dernier passage = dernière ligne d'historique de la porte.
-- Jusqu'ici l'historique recopiait aussi le propriétaire de l'immeuble à côté de
-- l'auteur réel (commercialId ET managerId remplis). Sur ces lignes, l'auteur réel
-- est celui qui ne correspond pas au propriétaire recopié (Immeuble.managerId).
UPDATE "Porte" p
SET
  "dernierCommercialId" = CASE
    WHEN h."commercialId" IS NOT NULL AND h."managerId" IS NOT NULL
      THEN CASE WHEN h."managerId" IS DISTINCT FROM i."managerId" THEN NULL ELSE h."commercialId" END
    ELSE h."commercialId"
  END,
  "dernierManagerId" = CASE
    WHEN h."commercialId" IS NOT NULL AND h."managerId" IS NOT NULL
      THEN CASE WHEN h."managerId" IS DISTINCT FROM i."managerId" THEN h."managerId" ELSE NULL END
    ELSE h."managerId"
  END
FROM (
  SELECT DISTINCT ON ("porteId") "porteId", "commercialId", "managerId"
  FROM "StatusHistorique"
  ORDER BY "porteId", "createdAt" DESC, "id" DESC
) h, "Immeuble" i
WHERE h."porteId" = p."id" AND i."id" = p."immeubleId";

-- Backfill : porte prospectée sans auteur connu → propriétaire actuel de l'immeuble
-- (le commercial s'il y en a un, sinon le manager), comme les stats le comptaient.
UPDATE "Porte" p
SET
  "dernierCommercialId" = i."commercialId",
  "dernierManagerId" = CASE WHEN i."commercialId" IS NULL THEN i."managerId" END
FROM "Immeuble" i
WHERE i."id" = p."immeubleId"
  AND p."statut" <> 'NON_VISITE'
  AND p."dernierCommercialId" IS NULL
  AND p."dernierManagerId" IS NULL;
