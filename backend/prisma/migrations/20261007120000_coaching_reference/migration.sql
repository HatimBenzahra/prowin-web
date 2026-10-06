-- CreateEnum
CREATE TYPE "CoachingReferenceStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "CoachingAnalysis" ADD COLUMN     "referenceId" INTEGER,
ALTER COLUMN "salesPlanVersionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CoachingReference" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "status" "CoachingReferenceStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT,
    "planMarkdown" TEXT,
    "planContentHash" TEXT,
    "planSlug" TEXT,
    "planTitle" TEXT,
    "planCriteria" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "CoachingReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingReferenceProduct" (
    "id" SERIAL NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "identifiers" TEXT[],
    "sttTerms" TEXT[],
    "offreExternalIds" INTEGER[],
    "offreFournisseur" TEXT,
    "sheetMarkdown" TEXT,
    "sheetContentHash" TEXT,
    "sheetContent" JSONB,

    CONSTRAINT "CoachingReferenceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachingReference_tenantId_status_idx" ON "CoachingReference"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingReference_tenantId_version_key" ON "CoachingReference"("tenantId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingReferenceProduct_referenceId_key_key" ON "CoachingReferenceProduct"("referenceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingAnalysis_appelant_audio_referentiel_key" ON "CoachingAnalysis"("source", "tenantId", "s3KeyOriginal", "referenceId");

-- AddForeignKey
ALTER TABLE "CoachingReferenceProduct" ADD CONSTRAINT "CoachingReferenceProduct_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "CoachingReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAnalysis" ADD CONSTRAINT "CoachingAnalysis_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "CoachingReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Au plus un brouillon et un seul référentiel actif par tenant : garantis par la base,
-- pas seulement par le code (Prisma ne décrit pas les index partiels).
CREATE UNIQUE INDEX "CoachingReference_un_brouillon_par_tenant" ON "CoachingReference"("tenantId") WHERE "status" = 'DRAFT';
CREATE UNIQUE INDEX "CoachingReference_un_actif_par_tenant" ON "CoachingReference"("tenantId") WHERE "isActive";
-- Seule une version publiée peut être active, et une version publiée a un numéro.
ALTER TABLE "CoachingReference" ADD CONSTRAINT "CoachingReference_actif_publie" CHECK (NOT "isActive" OR "status" = 'PUBLISHED');
ALTER TABLE "CoachingReference" ADD CONSTRAINT "CoachingReference_publie_numerote" CHECK ("status" <> 'PUBLISHED' OR ("version" IS NOT NULL AND "contentHash" IS NOT NULL AND "planMarkdown" IS NOT NULL));
