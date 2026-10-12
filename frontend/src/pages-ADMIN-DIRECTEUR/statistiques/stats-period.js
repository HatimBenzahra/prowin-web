/**
 * Logique de période de la page Statistiques — pure et testable.
 *
 * Séparée du hook parce que c'est ici que se cachent les erreurs qui ne se voient
 * pas : une borne de fin qui exclut sa propre journée, une clé de semaine qui saute
 * au changement d'année, une granularité qui produit 365 points illisibles.
 */

/** Nombre de jours couverts par défaut à l'ouverture de la page. */
export const DEFAULT_PERIOD_DAYS = 30

/**
 * Date locale au format `YYYY-MM-DD`.
 *
 * Ne pas repasser par `toISOString()` : il convertit en UTC, et une date posée à
 * minuit heure française reculerait d'un jour. Même précaution que
 * `hooks/utils/filters/date-presets.js`.
 */
export const toLocalISODate = date => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Plage par défaut : les `DEFAULT_PERIOD_DAYS` derniers jours, bornes incluses. */
export const defaultRange = (now = new Date()) => {
  const start = new Date(now)
  start.setDate(start.getDate() - (DEFAULT_PERIOD_DAYS - 1))
  return { start: toLocalISODate(start), end: toLocalISODate(now) }
}

/**
 * Borne de début en instant ISO : minuit heure locale.
 * Sans le `setHours`, une plage démarrant le 5 août pouvait exclure une partie de
 * la journée du 5 selon le fuseau.
 */
export const toIsoStart = value => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

/**
 * Borne de fin en instant ISO : dernière milliseconde de la journée locale.
 * Sans ça, une fin de période au 5 août excluait tout ce qui s'est passé le 5.
 */
export const toIsoEnd = value => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

/**
 * Granularité de regroupement déduite de l'amplitude de la période.
 *
 * Un découpage au jour sur un an produit 365 points illisibles ; au mois sur une
 * semaine, un seul point. On adapte plutôt que d'imposer un sélecteur de plus.
 */
export const granularityForRange = (startIso, endIso) => {
  if (!startIso || !endIso) return 'month'
  const spanDays = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 86400000
  if (Number.isNaN(spanDays)) return 'month'
  if (spanDays <= 45) return 'day'
  if (spanDays <= 200) return 'week'
  return 'month'
}

/**
 * Clé de semaine ISO au format du backend (`2026-W32`).
 *
 * Recalculée côté front parce que la timeline d'activité arrive au jour : sans ce
 * repli, les contrats signés et les contrats validés ne partageraient pas les mêmes
 * catégories d'abscisse dès que la granularité passe à la semaine.
 *
 * Suit la règle ISO-8601 : la semaine appartient à l'année de son jeudi, ce qui fait
 * qu'un 1er janvier peut relever de la semaine 52 ou 53 de l'année précédente.
 *
 * Miroir exact de `isoWeekKey` dans `backend/src/statistic/statistic.metrics.ts` : les
 * deux séries du graphe signés/validés doivent partager les mêmes catégories, donc les
 * deux implémentations doivent rester identiques. Ne pas « corriger » l'une sans l'autre.
 */
export const isoWeekKey = date => {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Clé de regroupement d'un jour donné, selon la granularité.
 * `iso` est une date locale `YYYY-MM-DD`.
 */
export const periodKeyForDate = (date, granularity) => {
  const iso = toLocalISODate(date)
  if (granularity === 'month') return iso.slice(0, 7)
  if (granularity === 'week') return isoWeekKey(date)
  return iso
}
