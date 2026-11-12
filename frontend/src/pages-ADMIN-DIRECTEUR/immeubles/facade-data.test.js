import { describe, expect, it } from 'vitest'
import {
  buildChronologie,
  buildFacadeFloors,
  formatDateHeureCourte,
  formatHeureVisite,
  formatJourVisite,
} from './facade-data'

const immeuble = { typeHabitat: 'IMMEUBLE', nbEtages: 15, nbPortesParEtage: 4, adresse: 'x' }

describe('buildFacadeFloors', () => {
  it('prend derniereVisite avant updatedAt comme heure de passage', () => {
    const { floors } = buildFacadeFloors(immeuble, [
      {
        id: 1,
        numero: '1500',
        etage: 15,
        statut: 'ABSENT',
        derniereVisite: '2026-11-09T10:00:00',
        updatedAt: '2026-11-09T18:00:00',
      },
    ])
    const door = floors.flatMap(f => f.doors)[0]
    expect(door.lastVisit).toBe('2026-11-09T10:00:00')
  })
})

describe('buildChronologie', () => {
  const floors = [
    {
      floor: 15,
      doors: [
        { porteId: 1, lastVisit: '2026-11-08T09:15:00' },
        { porteId: 2, lastVisit: '2026-11-09T14:32:00' },
        { porteId: 3, lastVisit: null },
      ],
    },
    { floor: 2, doors: [{ porteId: 4, lastVisit: '2026-11-09T16:05:00' }] },
  ]

  it('groupe par jour, le plus récent en premier, sans tenir compte des étages', () => {
    const groups = buildChronologie(floors)
    expect(groups.map(g => g.doors.map(d => d.porteId))).toEqual([[4, 2], [1], [3]])
    expect(groups[0].label).toBe('Lundi 9 novembre 2026')
    expect(groups[2].key).toBe('sans-date')
  })

  it('ne crée pas de groupe sans date quand toutes les portes ont un passage', () => {
    const groups = buildChronologie([floors[1]])
    expect(groups).toHaveLength(1)
  })
})

describe('formatage date/heure', () => {
  it('formate en français', () => {
    expect(formatHeureVisite('2026-11-09T14:32:00')).toBe('14:32')
    expect(formatJourVisite('2026-11-09T14:32:00')).toBe('Lundi 9 novembre 2026')
    expect(formatDateHeureCourte('2026-11-09T14:32:00')).toBe('09/11/2026 à 14:32')
  })

  it('renvoie null sans date valide', () => {
    expect(formatHeureVisite(null)).toBeNull()
    expect(formatJourVisite('n/a')).toBeNull()
    expect(formatDateHeureCourte(undefined)).toBeNull()
  })
})
