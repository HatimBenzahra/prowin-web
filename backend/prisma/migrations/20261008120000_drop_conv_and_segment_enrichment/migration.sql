-- Fin de l'extraction _conv et de l'enrichissement Whisper par segment : un
-- audio = une porte, le segment se lit sur l'audio original. Les segments
-- jamais découpés (PENDING/PROCESSING) ou dont la découpe a échoué (FAILED)
-- sont donc lisibles : sans s3KeySegment, la lecture prend s3KeyOriginal.
UPDATE "RecordingSegment" SET "status" = 'COMPLETED' WHERE "status" <> 'COMPLETED';

-- DropIndex
DROP INDEX "Recording_hasConversation_idx";

-- AlterTable
ALTER TABLE "RecordingSegment" DROP COLUMN "speechScore",
DROP COLUMN "transcription",
ALTER COLUMN "status" SET DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "Recording" DROP COLUMN "hasConversation";
