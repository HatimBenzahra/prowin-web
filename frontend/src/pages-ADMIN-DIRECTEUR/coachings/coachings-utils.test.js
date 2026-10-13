import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FILTERS,
  activeFiltersCount,
  normalizeAddress,
  rowSubject,
  aggregate,
  dayLabel,
  groupRows,
  neighbourKey,
  parseFilters,
  periodRange,
  porteLabel,
  serializeFilters,
  toJournalFilter,
  visibleKeys,
} from './coachings-utils'

const row = (s3Key, extra = {}) => ({
  s3Key,
  day: '2026-10-13',
  immeubleId: 1,
  adresse: '12 rue Bobet',
  subjectId: 3,
  subjectRole: 'commercial',
  subjectName: 'Léa Martin',
  porteEtage: 2,
  porteNumero: '204',
  statutPorte: 'ARGUMENTE',
  analysis: null,
  ...extra,
})
const ready = (score, band = null, extra = {}) => ({ status: 'READY', score, band, ...extra })

describe('filtres ⇄ URL', () => {
  it('aller-retour sans perte', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      period: 'custom',
      from: '2026-10-01',
      to: '2026-10-10',
      subject: 'manager:2',
      q: 'Foch',
      immeubles: [12, 40],
      favoris: true,
      statuts: ['REFUS', 'ARGUMENTE'],
      resultats: ['VENTE'],
      bands: ['maitrise', 'non_evaluable'],
      produit: 'purea',
      accepte: true,
      nonAnalyses: true,
      archives: true,
      group: 'commercial',
    }
    const params = serializeFilters(filters, 'recordings/a.mp4')
    expect(parseFilters(params)).toEqual(filters)
    expect(params.get('s')).toBe('recordings/a.mp4')
  })

  it('les valeurs par défaut ne figurent pas dans l’URL', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('')
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
  })

  it('ignore les valeurs invalides', () => {
    const f = parseFilters(
      new URLSearchParams(
        'periode=x&vue=y&commercial=foo&immeuble=-1,x&bande=rouge,maitrise&du=hier'
      )
    )
    expect(f).toMatchObject({
      period: '7d',
      group: 'batiment',
      subject: '',
      immeubles: [],
      bands: ['maitrise'],
      from: '',
    })
  })

  it('« acceptés seulement » n’a de sens qu’avec un produit', () => {
    expect(serializeFilters({ ...DEFAULT_FILTERS, accepte: true }).has('accepte')).toBe(false)
  })
})

describe('période', () => {
  const now = new Date(2026, 9, 13, 15, 30)
  it.each([
    ['today', new Date(2026, 9, 13), new Date(2026, 9, 13, 23, 59, 59, 999)],
    ['yesterday', new Date(2026, 9, 12), new Date(2026, 9, 12, 23, 59, 59, 999)],
    ['7d', new Date(2026, 9, 7), new Date(2026, 9, 13, 23, 59, 59, 999)],
    ['30d', new Date(2026, 8, 14), new Date(2026, 9, 13, 23, 59, 59, 999)],
  ])('%s', (period, from, to) => {
    expect(periodRange({ period }, now)).toEqual({ dateFrom: from, dateTo: to })
  })

  it('personnalisée, bornes incluses et ouverte si incomplète', () => {
    expect(periodRange({ period: 'custom', from: '2026-10-01', to: '2026-10-02' }, now)).toEqual({
      dateFrom: new Date(2026, 9, 1),
      dateTo: new Date(2026, 9, 2, 23, 59, 59, 999),
    })
    expect(periodRange({ period: 'custom', from: '', to: '' }, now)).toEqual({
      dateFrom: null,
      dateTo: null,
    })
  })

  it('filtre GraphQL', () => {
    const filter = toJournalFilter(
      { ...DEFAULT_FILTERS, period: 'today', subject: 'commercial:3', statuts: ['REFUS'], q: '  ' },
      now
    )
    expect(filter).toMatchObject({
      dateFrom: new Date(2026, 9, 13).toISOString(),
      commercialId: 3,
      managerId: null,
      search: null,
      statutPorte: ['REFUS'],
      visitResult: null,
      favorisOnly: null,
      productAcceptedOnly: null,
    })
  })
})

describe('agrégats', () => {
  it('score moyen hors visites non évaluables et analyses non prêtes ; ventes', () => {
    const stats = aggregate([
      row('a', { analysis: ready(80, 'correct') }),
      row('b', { analysis: ready(40, 'non_evaluable') }),
      row('c', { analysis: ready(91, null, { visitResult: 'VENTE' }) }),
      row('d', { analysis: { status: 'ANALYZING', score: null } }),
      row('e', { statutPorte: 'CONTRAT_SIGNE' }),
    ])
    expect(stats).toEqual({
      nbPortes: 5,
      nbAnalyses: 2,
      scoreMoyen: 85.5,
      band: 'maitrise',
      nbVentes: 2,
    })
  })

  it('sans score : ni moyenne ni bande', () => {
    expect(aggregate([row('a')])).toMatchObject({ scoreMoyen: null, band: null })
  })
})

describe('regroupement', () => {
  const rows = [
    row('a', { immeubleId: 1 }),
    row('b', { immeubleId: 2, adresse: '5 avenue Foch', subjectId: 4, subjectName: 'Paul Roy' }),
    row('c', { immeubleId: 1 }),
    row('d', { day: '2026-10-12', immeubleId: 1 }),
  ]

  it('jour › bâtiment, dans l’ordre du plus récent', () => {
    const tree = groupRows(rows)
    expect(tree.map(d => d.day)).toEqual(['2026-10-13', '2026-10-12'])
    expect(tree[0].groups.map(g => [g.adresse, g.rows.map(r => r.s3Key)])).toEqual([
      ['12 rue Bobet', ['a', 'c']],
      ['5 avenue Foch', ['b']],
    ])
    expect(tree[0].stats.nbPortes).toBe(3)
    expect(tree[0].groups[0].subjects).toEqual(['Léa Martin'])
  })

  it('jour › commercial, et liste', () => {
    expect(groupRows(rows, 'commercial')[0].groups.map(g => g.subjects)).toEqual([
      ['Léa Martin'],
      ['Paul Roy'],
    ])
    expect(groupRows(rows, 'liste')[0].groups.map(g => g.rows.length)).toEqual([3])
  })

  it('navigation clavier : groupes repliés exclus, bornée aux extrémités', () => {
    const tree = groupRows(rows)
    const keys = visibleKeys(tree, new Set(['2026-10-13|b:5 avenue foch']))
    expect(keys).toEqual(['a', 'c', 'd'])
    expect(visibleKeys(tree, new Set(['2026-10-12']))).toEqual(['a', 'c', 'b'])
    expect(neighbourKey(keys, 'a', 1)).toBe('c')
    expect(neighbourKey(keys, 'a', -1)).toBe('a')
    expect(neighbourKey(keys, 'd', 1)).toBe('d')
    expect(neighbourKey(keys, 'absent', 1)).toBe('a')
    expect(neighbourKey([], 'a', 1)).toBeNull()
  })
})

describe('libellés', () => {
  const now = new Date(2026, 9, 13, 10)
  it('jour', () => {
    expect(dayLabel('2026-10-13', now)).toBe('Aujourd’hui')
    expect(dayLabel('2026-10-12', now)).toBe('Hier')
    expect(dayLabel('2026-10-05', now)).toBe('lundi 5 octobre')
  })
  it('porte', () => {
    expect(porteLabel(row('a'))).toBe('Ét. 2 · Porte 204')
    expect(porteLabel(row('a', { porteEtage: 0 }))).toBe('RDC · Porte 204')
  })
})

describe('bâtiment : adresse normalisée', () => {
  it('normalise casse, accents, ponctuation et espaces', () => {
    expect(normalizeAddress('  2, Avenue du Val-de-Fontenay ')).toBe('2 avenue du val de fontenay')
    expect(normalizeAddress('12 Rue de l’Église')).toBe('12 rue de l eglise')
    expect(normalizeAddress(null)).toBe('')
  })

  it('deux fiches de la même adresse font une seule carte, ids conservés', () => {
    const tree = groupRows([
      row('a', { immeubleId: 7, adresse: '2 Avenue du Val de Fontenay' }),
      row('b', { immeubleId: 9, adresse: '2, avenue du Val-de-Fontenay' }),
    ])
    expect(tree[0].groups).toHaveLength(1)
    expect(tree[0].groups[0].immeubleIds).toEqual([7, 9])
    expect(tree[0].groups[0].rows.map(r => r.immeubleId)).toEqual([7, 9])
  })

  it('filtre GraphQL sur les ids du bâtiment', () => {
    expect(toJournalFilter({ ...DEFAULT_FILTERS, immeubles: [7, 9] }).immeubleIds).toEqual([7, 9])
    expect(toJournalFilter(DEFAULT_FILTERS).immeubleIds).toBeNull()
  })
})

describe('non évaluables hors des moyennes', () => {
  it('inexploitable et ancienne analyse notée 0 ne comptent pas', () => {
    const stats = aggregate([
      row('a', { analysis: ready(80, 'correct') }),
      row('b', { analysis: ready(null, null, { quality: 'INEXPLOITABLE' }) }),
      row('c', { analysis: ready(0, null, { quality: 'LOW_CONFIDENCE' }) }),
    ])
    expect(stats).toMatchObject({ nbAnalyses: 1, scoreMoyen: 80 })
  })
})

describe('intervenant sur la ligne', () => {
  const r = row('a')
  it('masqué quand la carte le dit déjà', () => {
    expect(rowSubject(r, 'batiment', ['Léa Martin'])).toBeNull()
    expect(rowSubject(r, 'commercial', ['Léa Martin'])).toBeNull()
  })
  it('affiché quand la carte en compte plusieurs, et en liste', () => {
    expect(rowSubject(r, 'batiment', ['Léa Martin', 'Paul Roy'])).toBe('Léa Martin')
    expect(rowSubject(r, 'liste')).toBe('Léa Martin')
  })
})

describe('compteur de filtres', () => {
  it('ignore période et vue, compte chaque filtre une fois', () => {
    expect(
      activeFiltersCount({ ...DEFAULT_FILTERS, period: 'today', group: 'liste', q: '  ' })
    ).toBe(0)
    expect(
      activeFiltersCount({
        ...DEFAULT_FILTERS,
        subject: 'commercial:3',
        statuts: ['REFUS', 'ARGUMENTE'],
        bands: ['maitrise'],
        favoris: true,
        immeubles: [7, 9],
      })
    ).toBe(5)
  })
})

describe('archivés', () => {
  it('masqués par défaut, « archives=1 » ne montre qu’eux et compte comme filtre', () => {
    expect(toJournalFilter(DEFAULT_FILTERS).archived).toBeNull()
    const filters = parseFilters(new URLSearchParams('archives=1'))
    expect(filters.archives).toBe(true)
    expect(toJournalFilter(filters).archived).toBe('only')
    expect(activeFiltersCount(filters)).toBe(1)
    expect(serializeFilters(filters).toString()).toBe('archives=1')
  })
})
