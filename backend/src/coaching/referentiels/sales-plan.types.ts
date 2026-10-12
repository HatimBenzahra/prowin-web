/**
 * Types du plan de vente structuré (issu du frontmatter markdown).
 * Le frontmatter est la vérité machine : étapes + critères + poids + points.
 */

export type StepApplicability =
  | 'always'
  | 'contractSigned'
  | `productDetected:${string}`;

export interface CriterionDef {
  key: string;
  label: string;
  points: number; // barème max du critère (typiquement 100)
  evidenceRequired?: boolean;
  /** Des illustrations, pas une liste à cocher : un comportement s'écrit dans `label`. */
  expectedSignals?: string[];
  /** Optionnel : restreint l'applicabilité du critère (par défaut = celle de l'étape). */
  appliesWhen?: StepApplicability;
  /**
   * true → critère jugé en passe 2 (conformité produit), pas en passe 1.
   * La passe 2 dispose de la fiche produit ; la passe 1 ne l'a pas.
   */
  requiresProductSheet?: boolean;
}

export interface StepDef {
  key: string;
  label: string;
  weight: number; // poids de l'étape dans le score global
  appliesWhen: StepApplicability;
  criteria: CriterionDef[];
  /** Titre de la section du corps qui porte l'argumentaire, résolu en `pitchText`. */
  pitchSection?: string;
  /** Second référentiel de la conformité : réciter le plan n'est jamais une faute. */
  pitchText?: string;
}

/** Le malus s'applique au score global : les étapes gardent leur barème intact. */
export interface PlanMalus {
  /** Affirmation juridiquement fausse ou engagement impossible. */
  grave: number;
  /** Chiffre ou périmètre inventé, au-delà des deux référentiels. */
  modere: number;
  /** Plafond du malus cumulé sur une analyse. */
  maxTotal: number;
}

/** Plan de vente parsé (contenu du frontmatter). */
export interface ParsedSalesPlan {
  slug: string;
  title: string;
  scoringScale: number;
  language?: string;
  context?: string;
  malus: PlanMalus;
  steps: StepDef[];
  /** Le pendant des `sttTerms` d'une fiche, pour ce qui n'appartient à aucun produit. */
  sttTerms?: string[];
}

/** Payload stocké dans SalesPlanVersion.criteria (JSON). */
export interface SalesPlanCriteriaPayload {
  scoringScale: number;
  malus: PlanMalus;
  steps: StepDef[];
  context?: string;
  language?: string;
  sttTerms?: string[];
}
