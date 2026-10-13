/**
 * Page Coachings : filtres ⇄ URL, période, regroupement et agrégats du journal. Module
 * pur (sans React) pour être testé.
 */
import { isNotEvaluable, scoreBand, showsScore } from '../coaching/coaching-calibration'

export const PERIODS = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: 'custom', label: 'Période' },
]

export const GROUP_BY = [
  { value: 'batiment', label: 'Date › Bâtiment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'liste', label: 'Liste' },
]

export const BAND_FILTERS = ['maitrise', 'correct', 'coaching', 'insuffisant', 'non_evaluable']

const SALE_RESULTS = ['VENTE', 'VENTE_MULTI_PRODUITS']

export const DEFAULT_FILTERS = {
  period: '7d',
  from: '',
  to: '',
  subject: '', // "commercial:3" | "manager:2"
  q: '',
  immeubles: [], // ids des immeubles d'un même bâtiment (adresse normalisée)
  favoris: false,
  statuts: [],
  resultats: [],
  bands: [],
  produit: '',
  accepte: false,
  nonAnalyses: false,
  group: 'batiment',
}

const list = value => (value ? value.split(',').filter(Boolean) : [])
const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')

/** Filtres depuis la query string ; toute valeur inconnue retombe sur le défaut. */
export function parseFilters(params) {
  const get = key => params.get(key) || ''
  const period = PERIODS.some(p => p.value === get('periode'))
    ? get('periode')
    : DEFAULT_FILTERS.period
  const group = GROUP_BY.some(g => g.value === get('vue')) ? get('vue') : DEFAULT_FILTERS.group
  return {
    period,
    from: isDay(get('du')) ? get('du') : '',
    to: isDay(get('au')) ? get('au') : '',
    subject: /^(commercial|manager):\d+$/.test(get('commercial')) ? get('commercial') : '',
    q: get('q'),
    immeubles: list(get('immeuble'))
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0),
    favoris: get('favoris') === '1',
    statuts: list(get('statut')),
    resultats: list(get('resultat')),
    bands: list(get('bande')).filter(b => BAND_FILTERS.includes(b)),
    produit: get('produit'),
    accepte: get('accepte') === '1',
    nonAnalyses: get('nonAnalyses') === '1',
    group,
  }
}

/** Query string des filtres : seules les valeurs différentes du défaut y figurent. */
export function serializeFilters(filters, selection = '') {
  const f = { ...DEFAULT_FILTERS, ...filters }
  const params = new URLSearchParams()
  const set = (key, value) => value && params.set(key, value)
  if (f.period !== DEFAULT_FILTERS.period) set('periode', f.period)
  if (f.period === 'custom') {
    set('du', f.from)
    set('au', f.to)
  }
  set('commercial', f.subject)
  set('q', f.q.trim())
  set('immeuble', f.immeubles.join(','))
  set('favoris', f.favoris ? '1' : '')
  set('statut', f.statuts.join(','))
  set('resultat', f.resultats.join(','))
  set('bande', f.bands.join(','))
  set('produit', f.produit)
  set('accepte', f.produit && f.accepte ? '1' : '')
  set('nonAnalyses', f.nonAnalyses ? '1' : '')
  if (f.group !== DEFAULT_FILTERS.group) set('vue', f.group)
  set('s', selection)
  return params
}

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const parseDay = day => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Bornes locales de la période ; une période personnalisée incomplète reste ouverte. */
export function periodRange(filters, now = new Date()) {
  const today = startOfDay(now)
  switch (filters.period) {
    case 'today':
      return { dateFrom: today, dateTo: endOfDay(today) }
    case 'yesterday':
      return { dateFrom: addDays(today, -1), dateTo: endOfDay(addDays(today, -1)) }
    case '30d':
      return { dateFrom: addDays(today, -29), dateTo: endOfDay(today) }
    case 'custom':
      return {
        dateFrom: filters.from ? parseDay(filters.from) : null,
        dateTo: filters.to ? endOfDay(parseDay(filters.to)) : null,
      }
    default:
      return { dateFrom: addDays(today, -6), dateTo: endOfDay(today) }
  }
}

/** Filtre GraphQL `CoachingJournalFilter` (sans curseur). */
export function toJournalFilter(filters, now = new Date()) {
  const { dateFrom, dateTo } = periodRange(filters, now)
  const [role, id] = filters.subject ? filters.subject.split(':') : []
  const orNull = v => (v && (!Array.isArray(v) || v.length) ? v : null)
  return {
    dateFrom: dateFrom?.toISOString() ?? null,
    dateTo: dateTo?.toISOString() ?? null,
    commercialId: role === 'commercial' ? Number(id) : null,
    managerId: role === 'manager' ? Number(id) : null,
    immeubleIds: orNull(filters.immeubles),
    search: orNull(filters.q.trim()),
    statutPorte: orNull(filters.statuts),
    visitResult: orNull(filters.resultats),
    band: orNull(filters.bands),
    productKey: orNull(filters.produit),
    productAcceptedOnly: filters.produit && filters.accepte ? true : null,
    favorisOnly: filters.favoris || null,
    nonAnalysesOnly: filters.nonAnalyses || null,
  }
}

/** Une vente : porte signée, ou résultat de visite vendeur. */
export const isSale = row =>
  row.statutPorte === 'CONTRAT_SIGNE' || SALE_RESULTS.includes(row.analysis?.visitResult)

/** Score affichable d'une ligne : analyse prête, évaluable (⚪ exclues des moyennes). */
export const rowScore = row => {
  const a = row.analysis
  return a?.status === 'READY' && !isNotEvaluable(a) && showsScore(a.score, a.band) ? a.score : null
}

/** Agrégats d'un groupe : portes, score moyen (hors non évaluables), bande, ventes. */
export function aggregate(rows) {
  const scores = rows.map(rowScore).filter(s => s != null)
  const scoreMoyen = scores.length
    ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
    : null
  return {
    nbPortes: rows.length,
    nbAnalyses: scores.length,
    scoreMoyen,
    band: scoreMoyen != null ? scoreBand(scoreMoyen) : null,
    nbVentes: rows.filter(isSale).length,
  }
}

/**
 * Adresse comparable : sans casse, accents, ponctuation ni espaces superflus. Deux
 * fiches « 2 Avenue du Val de Fontenay » et « 2, avenue du Val-de-Fontenay » sont un
 * seul bâtiment pour l'écoute.
 */
export const normalizeAddress = adresse =>
  (adresse || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Nom de l'intervenant sur une ligne : seulement s'il n'est pas déjà dit par la
 * carte (vue bâtiment à un seul intervenant, vue par commercial).
 */
export function rowSubject(row, groupBy, groupSubjects = []) {
  if (!row.subjectName || groupBy === 'commercial') return null
  if (groupBy === 'batiment' && groupSubjects.length <= 1) return null
  return row.subjectName
}

const subjectKey = row =>
  row.subjectId != null ? `${row.subjectRole}:${row.subjectId}` : 'inconnu'

/**
 * Regroupe les lignes (déjà triées du plus récent au plus ancien) : jour, puis
 * bâtiment ou commercial, puis portes. En vue « liste », un seul groupe par jour.
 * L'ordre des groupes suit leur audio le plus récent.
 */
export function groupRows(rows, groupBy = 'batiment') {
  const days = new Map()
  for (const row of rows) {
    if (!days.has(row.day)) days.set(row.day, new Map())
    const groups = days.get(row.day)
    const key =
      groupBy === 'commercial'
        ? subjectKey(row)
        : groupBy === 'liste'
          ? 'all'
          : `b:${normalizeAddress(row.adresse) || row.immeubleId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...days.entries()].map(([day, groups]) => {
    const dayRows = [...groups.values()].flat()
    return {
      day,
      stats: aggregate(dayRows),
      groups: [...groups.entries()].map(([key, groupRows]) => ({
        key: `${day}|${key}`,
        immeubleIds: [...new Set(groupRows.map(r => r.immeubleId))],
        adresse: groupRows[0].adresse,
        subjects: [...new Set(groupRows.map(r => r.subjectName).filter(Boolean))],
        rows: groupRows,
        stats: aggregate(groupRows),
      })),
    }
  })
}

/** Clés S3 dans l'ordre d'affichage, groupes repliés exclus : support de ↑/↓ et J/K. */
export function visibleKeys(tree, collapsed = new Set()) {
  const keys = []
  for (const day of tree) {
    if (collapsed.has(day.day)) continue
    for (const group of day.groups) {
      if (collapsed.has(group.key)) continue
      for (const row of group.rows) keys.push(row.s3Key)
    }
  }
  return keys
}

/** Clé voisine dans la liste ; la première au départ, et bornée aux extrémités. */
export function neighbourKey(keys, current, step) {
  if (!keys.length) return null
  const index = keys.indexOf(current)
  if (index === -1) return keys[0]
  return keys[Math.min(keys.length - 1, Math.max(0, index + step))]
}

/** « Aujourd’hui », « Hier », sinon « lundi 12 octobre ». */
export function dayLabel(day, now = new Date()) {
  const date = parseDay(day)
  const today = startOfDay(now)
  if (date.getTime() === today.getTime()) return 'Aujourd’hui'
  if (date.getTime() === addDays(today, -1).getTime()) return 'Hier'
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** « Ét. 2 · Porte 204 » ; le rez-de-chaussée en toutes lettres. */
export const porteLabel = row =>
  `${row.porteEtage === 0 ? 'RDC' : `Ét. ${row.porteEtage}`} · Porte ${row.porteNumero}`
