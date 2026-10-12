-- Termes que la TRANSCRIPTION doit orthographier juste (noms de marque, sigles,
-- chiffres-cles). Ils alimentent l'initial_prompt de Whisper depuis les
-- referentiels du coaching, au lieu du vocabulaire fige dans api_stt.py, qui
-- derivait a chaque changement de plan de vente.
--
-- Migration SEPAREE de 202608251000 volontairement : celle-ci etait deja
-- appliquee quand la colonne a ete ajoutee au schema. Prisma ne rejoue jamais une
-- migration enregistree, et modifier son fichier casse son checksum.
ALTER TABLE "ProductSheetVersion"
  ADD COLUMN "sttTerms" JSONB NOT NULL DEFAULT '[]';
