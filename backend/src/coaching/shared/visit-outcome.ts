import { CoachingQuality, Prisma } from '@prisma/client';

/**
 * Recalibrage 2026 : résultat de visite, statuts produit, indicateurs et contrôles
 * renvoyés par le moteur. Un moteur antérieur les omet : tout champ absent ou mal
 * formé devient null, jamais une erreur — l'analyse reste enregistrée.
 */
export const VISIT_RESULTS = ['VENTE', 'VENTE_MULTI_PRODUITS', 'REFUS_CLIENT', 'REPASSE_DECISIONNAIRE_ABSENT', 'A_RELANCER', 'NON_ELIGIBLE', 'VISITE_INTERROMPUE', 'ECHEC_COMMERCIAL'];
export const NON_SALE_REASONS = ['PRIX', 'BUDGET', 'CONJOINT_ABSENT', 'SOUHAITE_REFLECHIR', 'ABONNEMENT', 'REFUS_RIB', 'DEJA_EQUIPE', 'PAS_INTERESSE', 'MANQUE_CONFIANCE', 'INCOMPATIBILITE', 'OBJECTION_NON_TRAITEE', 'AUTRE'];
export const NEXT_ACTIONS = ['AUCUNE', 'REPASSE', 'RAPPEL', 'SIGNATURE_A_FINALISER', 'DOSSIER_A_COMPLETER'];
export const RIB_STATUSES = ['OUI', 'NON', 'NON_APPLICABLE'];
export const SIGNATURE_STATUSES = ['LIEN_SMS', 'LIEN_EMAIL', 'SIGNE', 'EN_ATTENTE', 'NON_SIGNE'];
export const PRODUCT_STATUSES = ['NON_PRESENTE', 'MENTIONNE', 'PRESENTE', 'REFUSE', 'ACCEPTE', 'NON_APPLICABLE'];
/** Un produit « proposé » au sens des statistiques : présenté, refusé ou accepté. */
export const PROPOSED_STATUSES = ['PRESENTE', 'REFUSE', 'ACCEPTE'];
const OPPORTUNITIES = ['oubliee', 'volontairement_non_presente'];
const BANDS = ['maitrise', 'correct', 'coaching', 'insuffisant', 'non_evaluable'];
const CONFIDENCE_LEVELS = ['haute', 'moyenne', 'faible'];
const CHECK_STATUSES = ['coherent', 'incoherent', 'non_verifiable'];
const TIMINGS = ['on_time', 'late', 'reordered_justified'];

/** Une visite « non évaluable » n'entre dans aucune moyenne de score (bande null = analyse antérieure). */
export const SCORABLE: Prisma.CoachingAnalysisWhereInput = { OR: [{ band: null }, { band: { not: 'non_evaluable' } }] };
export const isScorable = (row: { score: number | null; band?: string | null }) => row.score != null && row.band !== 'non_evaluable';
/** Résultats de visite qui sont une vente : pas de cause de perte. */
export const SALE_RESULTS = ['VENTE', 'VENTE_MULTI_PRODUITS'];

/** Score attendu selon le niveau du commercial. */
export const OBJECTIVE_BY_NIVEAU: Record<string, number> = { EN_FORMATION: 75, OPERATIONNEL: 80, CONFIRME: 85, EXPERT: 90 };

export interface ProductStatus {
  key: string; label: string; status: string;
  opportunity: string | null; naReason: string | null; naDetail: string | null; evidence: string[];
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const oneOf = (v: unknown, allowed: string[]) => (typeof v === 'string' && allowed.includes(v) ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : typeof v === 'string' ? [v] : []);
const list = <T>(v: unknown, map: (item: Record<string, unknown>) => T | null): T[] | null =>
  Array.isArray(v) ? v.flatMap(item => { const r = record(item); const out = r && map(r); return out ? [out] : []; }) : null;
const json = (v: unknown) => (v == null ? Prisma.DbNull : JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

export function productStatusOf(p: Record<string, unknown>): ProductStatus | null {
  const key = str(p.key);
  const status = oneOf(p.status, PRODUCT_STATUSES);
  if (!key || !status) return null;
  return { key, label: str(p.label) ?? key, status, opportunity: oneOf(p.opportunity, OPPORTUNITIES), naReason: str(p.naReason), naDetail: str(p.naDetail), evidence: strings(p.evidence) };
}

/**
 * Les colonnes du recalibrage pour un résultat du moteur. Une analyse inexploitable
 * ne publie aucun score (comme `score`) et sa bande est « non évaluable ».
 */
export function recalibrageData(result: Record<string, unknown>, quality: CoachingQuality): Prisma.CoachingAnalysisUpdateManyMutationInput {
  const masked = quality === CoachingQuality.INEXPLOITABLE;
  const outcome = record(result.outcome);
  const indicators = record(result.indicators);
  const confidence = record(result.analysisConfidence);
  return {
    executionScore: masked ? null : num(result.executionScore),
    outcomeScore: masked ? null : num(outcome?.outcomeScore),
    visitResult: oneOf(outcome?.visitResult, VISIT_RESULTS),
    nonSaleReason: oneOf(outcome?.nonSaleReason, NON_SALE_REASONS),
    nextAction: oneOf(outcome?.nextAction, NEXT_ACTIONS),
    ribStatus: oneOf(outcome?.rib, RIB_STATUSES),
    signatureStatus: oneOf(outcome?.signature, SIGNATURE_STATUSES),
    productStatuses: json(list(result.productStatuses, productStatusOf)),
    indicators: json(!masked && indicators ? { qualiteCommerciale: num(indicators.qualiteCommerciale), respectPlan: num(indicators.respectPlan), conformite: num(indicators.conformite) } : null),
    band: masked ? 'non_evaluable' : oneOf(result.band, BANDS),
    analysisConfidence: json(confidence && oneOf(confidence.level, CONFIDENCE_LEVELS) ? { level: confidence.level, reasons: strings(confidence.reasons) } : null),
    calculationChecks: json(list(result.calculationChecks, c => {
      const status = oneOf(c.status, CHECK_STATUSES);
      return status ? { quote: str(c.quote) ?? '', inputs: strings(c.inputs), expression: str(c.expression) ?? '', announced: num(c.announced), recomputed: num(c.recomputed), status, comment: str(c.comment) ?? '' } : null;
    })),
    contradictions: json(list(result.contradictions, c => (typeof c.quoteA === 'string' && typeof c.quoteB === 'string'
      ? { topic: str(c.topic) ?? 'autre', quoteA: c.quoteA, quoteB: c.quoteB, comment: str(c.comment) ?? '' } : null))),
    phaseTiming: json(list(result.phaseTiming, t => {
      const stepKey = str(t.stepKey);
      return stepKey ? { stepKey, timing: oneOf(t.timing, TIMINGS), evidence: strings(t.evidence), comment: str(t.comment) ?? '' } : null;
    })),
    outcomeOverriddenBy: null,
    outcomeOverriddenAt: null,
  };
}

/** Les mêmes colonnes, vidées : une analyse remise en file ne montre aucun ancien résultat. */
export const CLEARED_RECALIBRAGE = {
  executionScore: null, outcomeScore: null, visitResult: null, nonSaleReason: null, nextAction: null,
  ribStatus: null, signatureStatus: null, band: null, outcomeOverriddenBy: null, outcomeOverriddenAt: null,
  productStatuses: Prisma.DbNull, indicators: Prisma.DbNull, analysisConfidence: Prisma.DbNull,
  calculationChecks: Prisma.DbNull, contradictions: Prisma.DbNull, phaseTiming: Prisma.DbNull,
};

export interface TranscriptSegment { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }

/**
 * Segments horodatés du transcript, si la transcription les a fournis, avec leurs mesures
 * de qualité STT quand elles existent (elles nourrissent la confiance de l'analyse). Un
 * seul segment mal formé et aucun ne part.
 */
export function transcriptSegmentsOf(metadata: unknown): TranscriptSegment[] | undefined {
  const segments = record(metadata)?.segments;
  if (!Array.isArray(segments) || !segments.length) return undefined;
  const valid: TranscriptSegment[] = [];
  for (const s of segments) {
    const r = record(s);
    const start = num(r?.start), end = num(r?.end);
    // Tout ou rien : un seul segment invalide et la chronologie n'est plus fiable.
    if (!r || start == null || end == null || start < 0 || end < start || typeof r.text !== 'string') return undefined;
    const noSpeech = num(r.no_speech_prob), logprob = num(r.avg_logprob);
    valid.push({ start, end, text: r.text, ...(noSpeech != null ? { no_speech_prob: noSpeech } : {}), ...(logprob != null ? { avg_logprob: logprob } : {}) });
  }
  return valid;
}
