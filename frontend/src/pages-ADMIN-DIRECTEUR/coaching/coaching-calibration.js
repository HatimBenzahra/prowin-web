/**
 * Recalibrage coaching 2026 : seuils, libellés et statuts du moteur. Module pur (sans
 * React) pour être testé ; les composants en tirent couleurs et libellés.
 */

// Seuils du score global : 85 / 75 / 60.
export const BAND_META = {
  maitrise: {
    label: 'Maîtrisé',
    dot: 'bg-green-500',
    bar: 'bg-green-500',
    pill: 'bg-green-500/10 text-green-600',
    text: 'text-green-600',
  },
  correct: {
    label: 'Correct / perfectible',
    dot: 'bg-lime-500',
    bar: 'bg-lime-500',
    pill: 'bg-lime-500/10 text-lime-700',
    text: 'text-lime-700',
  },
  coaching: {
    label: 'Coaching nécessaire',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    pill: 'bg-amber-500/10 text-amber-600',
    text: 'text-amber-600',
  },
  insuffisant: {
    label: 'Insuffisant',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    pill: 'bg-red-500/10 text-red-600',
    text: 'text-red-600',
  },
  non_evaluable: {
    label: '⚪ Non évaluable',
    dot: 'bg-slate-300',
    bar: 'bg-muted',
    pill: 'bg-slate-500/10 text-slate-600',
    text: 'text-muted-foreground',
  },
}

/** La bande rendue par le moteur, sinon calculée depuis le score (analyses antérieures). */
export function scoreBand(score, band) {
  if (band && BAND_META[band]) return band
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'non_evaluable'
  if (score >= 85) return 'maitrise'
  if (score >= 75) return 'correct'
  if (score >= 60) return 'coaching'
  return 'insuffisant'
}

// Statuts de critère : 5 niveaux, découverte, N/A, non évaluable, et `atteint` (legacy).
export const CRITERION_META = {
  maitrise: { label: 'Maîtrisé', dot: 'bg-green-500', text: 'text-green-600', verdict: 'ok' },
  atteint: { label: 'Atteint', dot: 'bg-green-500', text: 'text-green-600', verdict: 'ok' },
  correct: { label: 'Correct', dot: 'bg-lime-500', text: 'text-lime-700', verdict: 'ok' },
  partiel: { label: 'Partiel', dot: 'bg-amber-500', text: 'text-amber-600', verdict: 'partial' },
  faible: { label: 'Faible', dot: 'bg-orange-500', text: 'text-orange-600', verdict: 'partial' },
  absent: { label: 'Absent', dot: 'bg-red-500', text: 'text-red-600', verdict: 'ko' },
  obtenue_question: {
    label: 'Obtenue par question',
    dot: 'bg-green-500',
    text: 'text-green-600',
    verdict: 'ok',
  },
  obtenue_spontanement: {
    label: 'Obtenue spontanément',
    dot: 'bg-green-500',
    text: 'text-green-600',
    verdict: 'ok',
  },
  manquante: { label: 'Manquante', dot: 'bg-red-500', text: 'text-red-600', verdict: 'ko' },
  non_applicable: {
    label: 'N/A',
    dot: 'bg-slate-300',
    text: 'text-muted-foreground',
    verdict: 'na',
  },
  non_evaluable: {
    label: 'Non évaluable',
    dot: 'bg-slate-300',
    text: 'text-muted-foreground',
    verdict: 'na',
  },
}

/** Méta d'un statut ; un statut inconnu s'affiche tel quel, sans être pris pour un échec. */
export const criterionMeta = status =>
  CRITERION_META[status] || {
    label: status || '—',
    dot: 'bg-slate-300',
    text: 'text-muted-foreground',
    verdict: 'na',
  }

export const NA_REASON_LABELS = {
  decisionnaire_absent: 'Décisionnaire absent',
  client_met_fin: 'Le client met fin à la visite',
  incompatibilite: 'Incompatibilité',
  client_ferme: 'Client fermé',
  visite_interrompue: 'Visite interrompue',
  autre: 'Autre',
}

export const TIMING_META = {
  late: { label: 'Trop tard', pill: 'bg-amber-500/10 text-amber-600' },
  reordered_justified: { label: 'Ordre justifié', pill: 'bg-sky-500/10 text-sky-600' },
}

export const VISIT_RESULT_LABELS = {
  VENTE: 'Vente',
  VENTE_MULTI_PRODUITS: 'Vente multi-produits',
  REFUS_CLIENT: 'Refus client',
  REPASSE_DECISIONNAIRE_ABSENT: 'Repasse (décisionnaire absent)',
  A_RELANCER: 'À relancer',
  NON_ELIGIBLE: 'Non éligible',
  VISITE_INTERROMPUE: 'Visite interrompue',
  ECHEC_COMMERCIAL: 'Échec commercial',
}

export const NON_SALE_REASON_LABELS = {
  PRIX: 'Prix',
  BUDGET: 'Budget',
  CONJOINT_ABSENT: 'Conjoint absent',
  SOUHAITE_REFLECHIR: 'Souhaite réfléchir',
  ABONNEMENT: 'Abonnement',
  REFUS_RIB: 'Refus du RIB',
  DEJA_EQUIPE: 'Déjà équipé',
  PAS_INTERESSE: 'Pas intéressé',
  MANQUE_CONFIANCE: 'Manque de confiance',
  INCOMPATIBILITE: 'Incompatibilité',
  OBJECTION_NON_TRAITEE: 'Objection non traitée',
  AUTRE: 'Autre',
}

export const NEXT_ACTION_LABELS = {
  AUCUNE: 'Aucune',
  REPASSE: 'Repasse',
  RAPPEL: 'Rappel',
  SIGNATURE_A_FINALISER: 'Signature à finaliser',
  DOSSIER_A_COMPLETER: 'Dossier à compléter',
}

export const RIB_LABELS = { OUI: 'Oui', NON: 'Non', NON_APPLICABLE: 'Non applicable' }

export const SIGNATURE_LABELS = {
  LIEN_SMS: 'Lien envoyé par SMS',
  LIEN_EMAIL: 'Lien envoyé par e-mail',
  SIGNE: 'Signé',
  EN_ATTENTE: 'En attente',
  NON_SIGNE: 'Non signé',
}

export const PRODUCT_STATUS_META = {
  ACCEPTE: { label: 'Accepté', pill: 'bg-green-500/10 text-green-600' },
  REFUSE: { label: 'Refusé', pill: 'bg-red-500/10 text-red-600' },
  PRESENTE: { label: 'Présenté', pill: 'bg-blue-500/10 text-blue-600' },
  MENTIONNE: { label: 'Mentionné', pill: 'bg-slate-500/10 text-slate-600' },
  NON_PRESENTE: { label: 'Non présenté', pill: 'bg-slate-500/10 text-muted-foreground' },
  NON_APPLICABLE: { label: 'Non applicable', pill: 'bg-slate-500/10 text-muted-foreground' },
}

export const NIVEAU_LABELS = {
  EN_FORMATION: 'En formation',
  OPERATIONNEL: 'Opérationnel',
  CONFIRME: 'Confirmé',
  EXPERT: 'Expert',
}

export const CONFIDENCE_LABELS = { haute: 'Haute', moyenne: 'Moyenne', faible: 'Faible' }

export const CHECK_STATUS_META = {
  coherent: { label: 'Cohérent', pill: 'bg-green-500/10 text-green-600' },
  incoherent: { label: 'Incohérent', pill: 'bg-red-500/10 text-red-600' },
  non_verifiable: { label: 'Non vérifiable', pill: 'bg-slate-500/10 text-slate-600' },
}

/** Avertissement avant une relance qui effacerait une correction manuelle. */
export const RELAUNCH_CORRECTION_WARNING =
  'Le résultat de visite de cette analyse a été corrigé à la main. La relance recalcule l’analyse : ces corrections seront perdues.'

/** Les options d'un sélecteur, depuis un dictionnaire de libellés. */
export const optionsOf = labels =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

/** Horodatage d'une preuve en mm:ss (null si inconnu). */
export function formatTimestamp(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return null
  const total = Math.floor(sec)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Un score s'affiche en chiffres, sauf pour une visite non évaluable (⚪). */
export const showsScore = (score, band) =>
  typeof score === 'number' && Number.isFinite(score) && band !== 'non_evaluable'

/**
 * Le score face à l'objectif du niveau du commercial. Null sans objectif, sans score,
 * sur une visite non évaluable, et sur une analyse antérieure au recalibrage (bande
 * absente) : ses seuils n'étaient pas ceux des objectifs.
 */
export function objectiveGap(score, objective, band) {
  if (!band || !showsScore(score, band) || typeof objective !== 'number') return null
  return score < objective
    ? {
        below: true,
        text: `En dessous du standard attendu pour son niveau (objectif ${objective}).`,
      }
    : {
        below: false,
        text: `Au niveau du standard attendu pour son niveau (objectif ${objective}).`,
      }
}

/**
 * Visite sans score exploitable : bande ⚪, échange inexploitable, ou analyse antérieure
 * au recalibrage (sans bande) notée 0 sur un échange trop court. Ces analyses n'ont pas
 * de chiffre à afficher et n'entrent dans aucune moyenne.
 */
export const isNotEvaluable = a =>
  Boolean(a) &&
  (a.band === 'non_evaluable' ||
    a.quality === 'INEXPLOITABLE' ||
    (a.band == null && a.score === 0 && a.quality === 'LOW_CONFIDENCE'))

/** Bornes des bandes, pour les infobulles. */
export const BAND_RANGES = {
  maitrise: 'Maîtrisé ≥ 85',
  correct: 'Correct 75–84',
  coaching: 'Coaching nécessaire 60–74',
  insuffisant: 'Insuffisant < 60',
  non_evaluable: 'Non évaluable',
}

/** Résultats sans part commerciale à noter : « — » plutôt que « non noté ». */
const OUTCOME_NOT_APPLICABLE = ['NON_ELIGIBLE', 'VISITE_INTERROMPUE']
export const NOT_RATED = 'Non noté par ce référentiel'

/** Points du résultat commercial ; le référentiel peut ne pas le noter du tout. */
export function outcomeScoreLabel(analysis) {
  if (typeof analysis?.outcomeScore === 'number')
    return String(Math.round(analysis.outcomeScore * 10) / 10)
  return OUTCOME_NOT_APPLICABLE.includes(analysis?.visitResult) ? '—' : NOT_RATED
}

const SIGNED = ['SIGNE', 'LIEN_SMS', 'LIEN_EMAIL']

/**
 * Le statut CRM de la porte contredit-il ce que l'IA a entendu ? Seulement sur une
 * analyse prête qui porte le résultat de visite (une analyse antérieure n'en dit rien).
 */
export function crmContradiction(statutPorte, analysis) {
  if (analysis?.status !== 'READY') return null
  const products = analysis.productStatuses || []
  if (!products.length && !analysis.signatureStatus) return null
  const accepted = products.filter(p => p.status === 'ACCEPTE')
  if (
    statutPorte === 'CONTRAT_SIGNE' &&
    !SIGNED.includes(analysis.signatureStatus) &&
    !accepted.length
  )
    return 'Porte notée « Contrat signé » dans le CRM, mais l’IA ne retrouve ni signature ni produit accepté dans l’audio.'
  if (statutPorte === 'REFUS' && accepted.length)
    return `Porte notée « Refus » dans le CRM, mais l’IA retrouve un produit accepté dans l’audio (${accepted
      .map(p => p.label || p.key)
      .join(', ')}).`
  return null
}
