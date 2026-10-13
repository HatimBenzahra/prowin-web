import { scoreBand } from './coaching-calibration'

/*
 * Teintes de la page Coachings. Mêmes couleurs que BAND_META / PORTE_STATUT_META /
 * PRODUCT_STATUS_META, mais lisibles en mode sombre : le texte s'éclaircit d'un cran
 * (`dark:text-*-400`), comme les tuiles KPI de l'application. La couleur porte un
 * sens — bande de score, statut — jamais de la décoration.
 *
 * Par entrée : `chip` pastille (fond teinté + liseré), `text` chiffre ou libellé,
 * `surface` carte teintée, `accent` filet gauche, `stroke` anneau de score, `bar`.
 */
export const BAND_TONE = {
  maitrise: {
    chip: 'bg-green-500/15 text-green-700 ring-green-500/30 dark:text-green-400',
    text: 'text-green-600 dark:text-green-400',
    surface: 'border-green-500/25 bg-green-500/5',
    accent: 'border-l-green-500',
    stroke: 'stroke-green-500',
    bar: 'bg-green-500',
  },
  correct: {
    chip: 'bg-lime-500/15 text-lime-700 ring-lime-500/30 dark:text-lime-400',
    text: 'text-lime-700 dark:text-lime-400',
    surface: 'border-lime-500/25 bg-lime-500/5',
    accent: 'border-l-lime-500',
    stroke: 'stroke-lime-500',
    bar: 'bg-lime-500',
  },
  coaching: {
    chip: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    surface: 'border-amber-500/25 bg-amber-500/5',
    accent: 'border-l-amber-500',
    stroke: 'stroke-amber-500',
    bar: 'bg-amber-500',
  },
  insuffisant: {
    chip: 'bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-400',
    text: 'text-red-600 dark:text-red-400',
    surface: 'border-red-500/25 bg-red-500/5',
    accent: 'border-l-red-500',
    stroke: 'stroke-red-500',
    bar: 'bg-red-500',
  },
  non_evaluable: {
    chip: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300',
    text: 'text-muted-foreground',
    surface: 'border-border/60 bg-muted/30',
    accent: 'border-l-slate-300 dark:border-l-slate-600',
    stroke: 'stroke-slate-400',
    bar: 'bg-muted',
  },
}

/** La teinte d'un score : bande du moteur, sinon calculée depuis la valeur. */
export const bandTone = (score, band) => BAND_TONE[scoreBand(score, band)]

const NEUTRAL = 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300'
const MUTED = 'bg-slate-500/10 text-muted-foreground ring-slate-500/15'
const GREEN = 'bg-green-500/15 text-green-700 ring-green-500/30 dark:text-green-400'
const RED = 'bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-400'
const AMBER = 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-400'
const BLUE = 'bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-400'
const INDIGO = 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300'
const SKY = 'bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-400'

/** Pastille du statut de porte (mêmes teintes que PORTE_STATUT_META). */
export const STATUT_TONE = {
  CONTRAT_SIGNE: GREEN,
  RENDEZ_VOUS_PRIS: BLUE,
  ARGUMENTE: INDIGO,
  NECESSITE_REPASSAGE: AMBER,
  REFUS: RED,
  ABSENT: NEUTRAL,
  NON_VISITE: MUTED,
}

/** Statut d'un produit : accepté, refusé, présenté, mentionné, puis le neutre. */
export const PRODUCT_TONE = {
  ACCEPTE: GREEN,
  REFUSE: RED,
  PRESENTE: BLUE,
  MENTIONNE: AMBER,
  NON_PRESENTE: MUTED,
  NON_APPLICABLE: MUTED,
}

/** Résultat de visite : vente en vert, échec en rouge, suite à donner en bleu ou ambre. */
export const VISIT_RESULT_TONE = {
  VENTE: GREEN,
  VENTE_MULTI_PRODUITS: GREEN,
  REFUS_CLIENT: RED,
  ECHEC_COMMERCIAL: RED,
  REPASSE_DECISIONNAIRE_ABSENT: AMBER,
  A_RELANCER: SKY,
  NON_ELIGIBLE: NEUTRAL,
  VISITE_INTERROMPUE: NEUTRAL,
}

export const TONE_NEUTRAL = NEUTRAL
export const TONE_MUTED = MUTED
