import { describe, it, expect } from 'vitest'
import {
  aggregateOutcomes,
  buildMonthlyPace,
  daysSince,
  rankTeamActivity,
} from './prospection-charts-utils'

/**
 * Un jour de terrain réaliste, construit selon le modèle de statuts du backend :
 * 2 CONTRAT_SIGNE, 3 RENDEZ_VOUS_PRIS, 4 ABSENT, 5 REFUS, 3 ARGUMENTE, 1 NECESSITE_REPASSAGE.
 * `refus` = REFUS + ARGUMENTE = 8 (ARGUMENTE a incrementRefus: true).
 * `portesProspectees` = 2 + 3 + 4 + 5 + 3 + 1 = 18.
 */
const DAY = {
  date: '2026-07-15',
  contratsSignes: 2,
  rdvPris: 3,
  absents: 4,
  refus: 8,
  argumentes: 3,
  repassages: 1,
  portesProspectees: 18,
}

describe('aggregateOutcomes', () => {
  it('produit une partition qui somme exactement aux portes prospectées', () => {
    const { total, buckets } = aggregateOutcomes([DAY])
    const sum = buckets.reduce((acc, b) => acc + b.count, 0)

    expect(total).toBe(18)
    expect(sum).toBe(total)
  })

  it("n'ajoute jamais les argumentés comme une part sœur des refus", () => {
    const { buckets, argumentes, refusSecs } = aggregateOutcomes([DAY])

    // Les argumentés sont un détail interne aux refus, pas un sixième bucket.
    expect(buckets).toHaveLength(5)
    expect(buckets.some(b => b.statut === 'ARGUMENTE')).toBe(false)

    const refus = buckets.find(b => b.statut === 'REFUS')
    expect(refus.count).toBe(8)
    expect(argumentes).toBe(3)
    expect(refusSecs).toBe(5)
    expect(refusSecs + argumentes).toBe(refus.count)
  })

  it('cumule plusieurs jours et trie par volume décroissant', () => {
    const { total, buckets } = aggregateOutcomes([DAY, DAY, DAY])

    expect(total).toBe(54)
    expect(buckets.reduce((acc, b) => acc + b.count, 0)).toBe(54)
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i - 1].count).toBeGreaterThanOrEqual(buckets[i].count)
    }
  })

  it('ne divise pas par zéro quand rien na été prospecté', () => {
    const { total, buckets } = aggregateOutcomes([])

    expect(total).toBe(0)
    expect(buckets.every(b => b.count === 0 && b.pct === 0)).toBe(true)
  })

  it('tolère des points partiels ou nuls', () => {
    const { total, buckets } = aggregateOutcomes([null, {}, { portesProspectees: 2, absents: 2 }])

    expect(total).toBe(2)
    expect(buckets.find(b => b.statut === 'ABSENT').count).toBe(2)
  })
})

describe('buildMonthlyPace', () => {
  const today = new Date(2026, 6, 3) // 3 juillet 2026

  it('cumule chaque série et tronque au jour courant', () => {
    const current = [
      { date: '2026-07-01', contratsSignes: 2 },
      { date: '2026-07-02', contratsSignes: 1 },
      { date: '2026-07-03', contratsSignes: 4 },
    ]
    const previous = [
      { date: '2026-06-01', contratsSignes: 1 },
      { date: '2026-06-02', contratsSignes: 1 },
      { date: '2026-06-03', contratsSignes: 1 },
      // Le 10 juin ne doit pas entrer dans la comparaison au 3 du mois.
      { date: '2026-06-10', contratsSignes: 50 },
    ]

    const {
      series,
      current: cur,
      previous: prev,
      delta,
    } = buildMonthlyPace(current, previous, today)

    expect(series).toHaveLength(3)
    expect(series.map(p => p.current)).toEqual([2, 3, 7])
    expect(series.map(p => p.previous)).toEqual([1, 2, 3])
    expect(cur).toBe(7)
    expect(prev).toBe(3)
    expect(delta).toBe(4)
  })

  it('lit le jour dans la chaîne ISO sans décalage de fuseau', () => {
    const series = buildMonthlyPace(
      [{ date: '2026-07-01T23:30:00.000Z', contratsSignes: 5 }],
      [],
      new Date(2026, 6, 1)
    ).series

    expect(series).toEqual([{ day: 1, current: 5, previous: 0 }])
  })

  it('rend un retard en delta négatif', () => {
    const { delta } = buildMonthlyPace(
      [{ date: '2026-07-01', contratsSignes: 1 }],
      [{ date: '2026-06-01', contratsSignes: 6 }],
      new Date(2026, 6, 1)
    )

    expect(delta).toBe(-5)
  })
})

describe('daysSince', () => {
  const now = new Date('2026-07-30T12:00:00.000Z')

  it('compte les jours entiers écoulés', () => {
    expect(daysSince('2026-07-27T12:00:00.000Z', now)).toBe(3)
    expect(daysSince('2026-07-30T11:00:00.000Z', now)).toBe(0)
  })

  it('renvoie null sur une date absente ou invalide', () => {
    expect(daysSince(null, now)).toBeNull()
    expect(daysSince('pas-une-date', now)).toBeNull()
  })

  it('ne renvoie jamais de négatif', () => {
    expect(daysSince('2026-08-05T12:00:00.000Z', now)).toBe(0)
  })
})

describe('rankTeamActivity', () => {
  const now = new Date('2026-07-30T12:00:00.000Z')

  it('trie par volume et marque les inactifs', () => {
    const ranked = rankTeamActivity(
      [
        {
          userId: 1,
          userType: 'commercial',
          userName: 'Denise',
          nbPortesProspectes: 10,
          tauxConversion: 12.5,
          lastActivityAt: '2026-07-30T09:00:00.000Z',
        },
        {
          userId: 2,
          userType: 'commercial',
          userName: 'Karim',
          nbPortesProspectes: 40,
          tauxConversion: 4,
          lastActivityAt: '2026-07-20T09:00:00.000Z',
        },
      ],
      { now }
    )

    expect(ranked.map(r => r.userName)).toEqual(['Karim', 'Denise'])
    expect(ranked[0].isIdle).toBe(true)
    expect(ranked[1].isIdle).toBe(false)
  })

  it('reprend le taux de conversion du backend sans le recalculer', () => {
    const [row] = rankTeamActivity(
      [
        {
          userId: 1,
          userName: 'Denise',
          nbPortesProspectes: 100,
          contratsSignes: 7,
          tauxConversion: 3.2, // volontairement incohérent avec 7/100
          lastActivityAt: now.toISOString(),
        },
      ],
      { now }
    )

    expect(row.tauxConversion).toBe(3.2)
  })

  it('sort le refus sec pour que les colonnes ne comptent pas les argumentés deux fois', () => {
    const [row] = rankTeamActivity(
      [
        {
          userId: 1,
          userName: 'Denise',
          nbPortesProspectes: 20,
          absents: 8,
          // Côté backend, ARGUMENTE incrémente aussi `refus` : les 3 argumentés
          // sont déjà compris dans ces 10.
          refus: 10,
          argumentes: 3,
          rendezVousPris: 1,
          contratsSignes: 1,
          lastActivityAt: now.toISOString(),
        },
      ],
      { now }
    )

    expect(row.refus).toBe(10)
    expect(row.argumentes).toBe(3)
    expect(row.refusSecs).toBe(7)
    // Les colonnes affichées ne doivent pas dépasser le volume prospecté.
    expect(row.absents + row.refusSecs + row.argumentes + row.rdv + row.contrats).toBe(row.portes)
  })

  it('expose absents, argumentés et RDV, absents de la première version', () => {
    const [row] = rankTeamActivity(
      [
        {
          userId: 1,
          userName: 'Denise',
          nbPortesProspectes: 5,
          absents: 2,
          argumentes: 1,
          refus: 1,
          rendezVousPris: 3,
          lastActivityAt: now.toISOString(),
        },
      ],
      { now }
    )

    expect(row.absents).toBe(2)
    expect(row.argumentes).toBe(1)
    expect(row.rdv).toBe(3)
  })

  it('tolère une liste vide ou nulle', () => {
    expect(rankTeamActivity(null)).toEqual([])
    expect(rankTeamActivity([])).toEqual([])
  })
})
