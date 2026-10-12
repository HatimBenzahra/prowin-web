-- Les seuils d'exploitabilite quittent le frontmatter du plan de vente pour la
-- config : un plan porte un bareme, pas une regle d'etiquetage. Le module de
-- coaching ne rend plus que des faits (duree mesuree, transcript, score) ; c'est
-- l'app qui decide ce qui est INEXPLOITABLE ou LOW_CONFIDENCE.
ALTER TABLE "CoachingConfig"
  ADD COLUMN "minDurationSec" INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN "minTranscriptChars" INTEGER NOT NULL DEFAULT 400,
  ADD COLUMN "lowConfidenceBelowSec" INTEGER NOT NULL DEFAULT 90;
