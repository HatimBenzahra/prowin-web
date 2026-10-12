import { describe, it, expect } from 'vitest'
import { scopeAndSortImmeubleRows } from './useStatisticsFilter'

const row = (id, lastActivityAt, portesInRange) => ({ id, lastActivityAt, portesInRange })

describe('scopeAndSortImmeubleRows', () => {
  it('ordonne sur la dernière activité, pas sur la création', () => {
    const rows = [
      row(1, '2026-05-01T10:00:00.000Z', 3),
      row(2, '2026-08-04T09:00:00.000Z', 1),
      row(3, '2026-07-20T18:00:00.000Z', 2),
    ]

    expect(scopeAndSortImmeubleRows(rows, false).map(r => r.id)).toEqual([2, 3, 1])
  })

  it('écarte les bâtiments sans activité dans la période filtrée', () => {
    const rows = [row(1, '2026-08-04T09:00:00.000Z', 2), row(2, null, 0), row(3, null, 0)]

    expect(scopeAndSortImmeubleRows(rows, true).map(r => r.id)).toEqual([1])
  })

  it('garde tous les bâtiments quand aucune période nest active', () => {
    const rows = [row(1, '2026-08-04T09:00:00.000Z', 2), row(2, null, 0)]

    // Sans filtre, un bâtiment jamais visité reste visible : c'est l'inventaire.
    expect(scopeAndSortImmeubleRows(rows, false)).toHaveLength(2)
  })

  it('place les bâtiments sans activité en dernier', () => {
    const rows = [row(1, null, 0), row(2, '2026-08-04T09:00:00.000Z', 1)]

    expect(scopeAndSortImmeubleRows(rows, false).map(r => r.id)).toEqual([2, 1])
  })

  it('ne mute pas la liste reçue', () => {
    const rows = [row(1, '2026-05-01T10:00:00.000Z', 1), row(2, '2026-08-04T09:00:00.000Z', 1)]
    scopeAndSortImmeubleRows(rows, false)

    expect(rows.map(r => r.id)).toEqual([1, 2])
  })

  it('tolère une liste absente', () => {
    expect(scopeAndSortImmeubleRows(null, true)).toEqual([])
    expect(scopeAndSortImmeubleRows(undefined, false)).toEqual([])
  })

  it('tolère une date dactivité invalide sans casser le tri', () => {
    const rows = [row(1, 'pas-une-date', 1), row(2, '2026-08-04T09:00:00.000Z', 1)]

    expect(scopeAndSortImmeubleRows(rows, false)).toHaveLength(2)
  })
})
