/**
 * Une fiche porte ce que la formation autorise à affirmer ; ce que dit le plan
 * vient de `StepDef.pitchText`, et les deux doivent rester indépendants.
 */

import { StepApplicability } from './sales-plan.types';

/** Gravité d'une violation de conformité produit. */
export type ViolationSeverity = 'grave' | 'modere';

/** Une IDÉE interdite, jamais une phrase à retrouver mot pour mot. */
export interface ForbiddenClaim {
  say: string;
  severity: ViolationSeverity;
}

/** Rattachement à l'offre WinLead+ : une fiche ne porte jamais de prix en dur. */
export interface WinLeadPlusBinding {
  externalIds?: number[];
  match?: { fournisseur?: string };
}

export interface ParsedProductSheet {
  slug: string;
  label: string;
  /** Forme complète, ex. `productDetected:depanssur`. */
  appliesTo: StepApplicability;
  /** Le slug produit seul, ex. `depanssur` — la clé de jointure avec detectedProducts. */
  productKey: string;
  /** Noms propres et sigles pour Whisper seul : pas de français courant, il sature le prompt. */
  sttTerms: string[];
  /** Ce que la formation autorise à affirmer. */
  facts: string[];
  /** De quoi reconnaître l'offre en passe 0, robuste aux noms de marque déformés. */
  identifiers: string[];
  /** Affirmations sensibles, avec leur gravité si elles ne sont pas couvertes par le plan. */
  forbidden: ForbiddenClaim[];
  winleadplus?: WinLeadPlusBinding;
}

export interface ParsedProductSheetFile {
  sheet: ParsedProductSheet;
  rawMarkdown: string;
  contentHash: string;
}
