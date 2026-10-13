-- Journal des écoutes : enregistrements archivés (« non intéressant »). Migration additive.

-- CreateTable
CREATE TABLE "CoachingArchive" (
    "s3Key" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedBy" TEXT,

    CONSTRAINT "CoachingArchive_pkey" PRIMARY KEY ("s3Key")
);
