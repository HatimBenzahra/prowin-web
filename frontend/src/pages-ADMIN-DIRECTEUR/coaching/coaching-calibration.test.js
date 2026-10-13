import { describe, expect, it } from 'vitest'
import {
  BAND_META,
  NOT_RATED,
  criterionMeta,
  crmContradiction,
  isNotEvaluable,
  outcomeScoreLabel,
  formatTimestamp,
  objectiveGap,
  scoreBand,
  showsScore,
} from './coaching-calibration'

describe('bandes de score 85 / 75 / 60', () => {
  it.each([
    [100, 'maitrise'],
    [85, 'maitrise'],
    [84.9, 'correct'],
    [75, 'correct'],
    [74.9, 'coaching'],
    [60, 'coaching'],
    [59.9, 'insuffisant'],
    [0, 'insuffisant'],
  ])('%s → %s', (score, band) => {
    expect(scoreBand(score)).toBe(band)
  })

  it('sans score, la visite est non évaluable', () => {
    expect(scoreBand(null)).toBe('non_evaluable')
    expect(BAND_META[scoreBand(undefined)].label).toBe('⚪ Non évaluable')
  })

  it('la bande du moteur prime sur le calcul local ; une bande inconnue est ignorée', () => {
    expect(scoreBand(92, 'non_evaluable')).toBe('non_evaluable')
    expect(scoreBand(70, 'excellent')).toBe('coaching')
  })

  it('libellés des bandes', () => {
    expect(['maitrise', 'correct', 'coaching', 'insuffisant'].map(b => BAND_META[b].label)).toEqual(
      ['Maîtrisé', 'Correct / perfectible', 'Coaching nécessaire', 'Insuffisant']
    )
  })
})

describe('statuts de critère', () => {
  it('5 niveaux, découverte et legacy atteint', () => {
    expect(criterionMeta('maitrise')).toMatchObject({ label: 'Maîtrisé', verdict: 'ok' })
    expect(criterionMeta('correct')).toMatchObject({ label: 'Correct', verdict: 'ok' })
    expect(criterionMeta('faible')).toMatchObject({ label: 'Faible', verdict: 'partial' })
    expect(criterionMeta('atteint')).toMatchObject({ label: 'Atteint', verdict: 'ok' })
    expect(criterionMeta('obtenue_spontanement').verdict).toBe('ok')
    expect(criterionMeta('manquante').verdict).toBe('ko')
  })

  it('N/A et non évaluable ne sont pas des manquements ; un statut inconnu non plus', () => {
    expect(criterionMeta('non_applicable').verdict).toBe('na')
    expect(criterionMeta('non_evaluable').verdict).toBe('na')
    expect(criterionMeta('nouveau_statut')).toMatchObject({
      label: 'nouveau_statut',
      verdict: 'na',
    })
  })
})

describe('preuves horodatées et objectif du niveau', () => {
  it('formate en mm:ss', () => {
    expect(formatTimestamp(0)).toBe('00:00')
    expect(formatTimestamp(754.6)).toBe('12:34')
    expect(formatTimestamp(null)).toBeNull()
  })

  it('signale un score en dessous de l’objectif du niveau', () => {
    expect(objectiveGap(78, 80, 'correct')).toMatchObject({ below: true })
    expect(objectiveGap(78, 80, 'correct').text).toContain(
      'En dessous du standard attendu pour son niveau'
    )
    expect(objectiveGap(86, 85, 'maitrise')).toMatchObject({ below: false })
    expect(objectiveGap(null, 80, 'correct')).toBeNull()
  })

  it('pas de comparaison à l’objectif pour une analyse antérieure ni une visite non évaluable', () => {
    expect(objectiveGap(78, 80, null)).toBeNull()
    expect(objectiveGap(78, 80, undefined)).toBeNull()
    expect(objectiveGap(78, 80, 'non_evaluable')).toBeNull()
  })
})

describe('affichage du score', () => {
  it('jamais de chiffre à côté de ⚪ Non évaluable ; une analyse antérieure garde son score', () => {
    expect(showsScore(72, 'non_evaluable')).toBe(false)
    expect(showsScore(null, 'correct')).toBe(false)
    expect(showsScore(72, null)).toBe(true)
    expect(BAND_META[scoreBand(72, null)].label).toBe('Coaching nécessaire')
  })
})

describe('page Coachings : non évaluable, résultat non noté, contradiction CRM', () => {
  it('isNotEvaluable', () => {
    expect(isNotEvaluable({ band: 'non_evaluable', score: 40 })).toBe(true)
    expect(isNotEvaluable({ quality: 'INEXPLOITABLE', score: null })).toBe(true)
    // Ancienne analyse, sans bande, notée 0 sur un échange trop court.
    expect(isNotEvaluable({ band: null, score: 0, quality: 'LOW_CONFIDENCE' })).toBe(true)
    expect(isNotEvaluable({ band: 'insuffisant', score: 0, quality: 'LOW_CONFIDENCE' })).toBe(false)
    expect(isNotEvaluable({ band: null, score: 62, quality: 'ANALYZED' })).toBe(false)
    expect(isNotEvaluable(null)).toBe(false)
  })

  it('outcomeScoreLabel', () => {
    expect(outcomeScoreLabel({ outcomeScore: 6.25 })).toBe('6.3')
    expect(outcomeScoreLabel({ outcomeScore: null, visitResult: 'NON_ELIGIBLE' })).toBe('—')
    expect(outcomeScoreLabel({ outcomeScore: null, visitResult: 'VENTE' })).toBe(NOT_RATED)
  })

  it('crmContradiction', () => {
    const ready = extra => ({
      status: 'READY',
      productStatuses: [{ key: 'tv', label: 'TV', status: 'REFUSE' }],
      ...extra,
    })
    expect(crmContradiction('CONTRAT_SIGNE', ready({ signatureStatus: 'NON_SIGNE' }))).toMatch(
      /ne retrouve ni signature/
    )
    expect(crmContradiction('CONTRAT_SIGNE', ready({ signatureStatus: 'LIEN_SMS' }))).toBeNull()
    expect(
      crmContradiction(
        'CONTRAT_SIGNE',
        ready({ productStatuses: [{ key: 'tv', status: 'ACCEPTE' }] })
      )
    ).toBeNull()
    expect(
      crmContradiction(
        'REFUS',
        ready({ productStatuses: [{ key: 'tv', label: 'TV', status: 'ACCEPTE' }] })
      )
    ).toMatch(/retrouve un produit accepté.*\(TV\)/)
    expect(crmContradiction('REFUS', ready())).toBeNull()
    // Analyse antérieure sans résultat de visite, ou pas prête : rien à opposer.
    expect(crmContradiction('CONTRAT_SIGNE', { status: 'READY', productStatuses: [] })).toBeNull()
    expect(crmContradiction('CONTRAT_SIGNE', ready({ status: 'ANALYZING' }))).toBeNull()
  })
})
