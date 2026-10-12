import { describe, it, expect } from 'vitest'
import {
  couvertureBarClass,
  paginateRows,
  sortCardRows,
  filterByAddress,
  groupRowsByDate,
  dayGroupLabel,
  CARD_PAGE_SIZE,
} from './immeubles-display'

const rows = length =>
  Array.from({ length }, (_, i) => ({
    id: i + 1,
    address: `${i + 1} rue de Test`,
    couverture: i,
    contrats_signes: i % 5,
    total_doors: length - i,
  }))

describe('paginateRows', () => {
  it("n'affiche qu'un lot au premier rendu, même sur un gros jeu", () => {
    const { visible, hasMore, total } = paginateRows(rows(1097), 1)

    expect(visible).toHaveLength(CARD_PAGE_SIZE)
    expect(hasMore).toBe(true)
    expect(total).toBe(1097)
  })

  it('cumule les lots demandés', () => {
    expect(paginateRows(rows(100), 2).visible).toHaveLength(CARD_PAGE_SIZE * 2)
    expect(paginateRows(rows(100), 3).visible).toHaveLength(CARD_PAGE_SIZE * 3)
  })

  it("signale l'absence de suite quand tout est affiché", () => {
    const { visible, hasMore } = paginateRows(rows(10), 1)

    expect(visible).toHaveLength(10)
    expect(hasMore).toBe(false)
  })

  it('traite le cas limite exact sans proposer de suite', () => {
    const { hasMore } = paginateRows(rows(CARD_PAGE_SIZE), 1)

    expect(hasMore).toBe(false)
  })

  it('tolère une liste absente et un nombre de lots invalide', () => {
    expect(paginateRows(null, 1)).toEqual({ visible: [], hasMore: false, total: 0 })
    expect(paginateRows(rows(30), 0).visible).toHaveLength(CARD_PAGE_SIZE)
    expect(paginateRows(rows(30), -5).visible).toHaveLength(CARD_PAGE_SIZE)
  })
})

describe('couvertureBarClass', () => {
  it('applique les seuils historiques de la page', () => {
    expect(couvertureBarClass(100)).toBe('bg-emerald-500')
    expect(couvertureBarClass(80)).toBe('bg-emerald-500')
    expect(couvertureBarClass(79.9)).toBe('bg-blue-500')
    expect(couvertureBarClass(40)).toBe('bg-blue-500')
    expect(couvertureBarClass(39.9)).toBe('bg-amber-500')
    expect(couvertureBarClass(0.1)).toBe('bg-amber-500')
    expect(couvertureBarClass(0)).toBe('bg-muted')
  })
})

describe('sortCardRows', () => {
  it('trie par couverture décroissante par défaut', () => {
    const sorted = sortCardRows(rows(5), 'couverture_desc')
    expect(sorted.map(r => r.couverture)).toEqual([4, 3, 2, 1, 0])
  })

  it("laisse l'ordre d'entrée intact en mode date", () => {
    // L'ordre chronologique est produit en amont : le tri ne doit pas l'écraser.
    const sorted = sortCardRows(rows(5), 'date')
    expect(sorted.map(r => r.couverture)).toEqual([0, 1, 2, 3, 4])
  })

  it("laisse aussi l'ordre intact si le mode est inconnu", () => {
    const sorted = sortCardRows(rows(3), 'nimporte_quoi')
    expect(sorted.map(r => r.couverture)).toEqual([0, 1, 2])
  })

  it('ne mute pas la liste reçue', () => {
    const original = rows(3)
    sortCardRows(original, 'couverture_desc')
    expect(original.map(r => r.couverture)).toEqual([0, 1, 2])
  })
})

describe('groupRowsByDate', () => {
  // 3 août 2026, en heure locale pour coller au découpage par journée.
  const now = new Date(2026, 7, 3, 14, 0, 0)
  const at = (y, m, d, h = 10) => new Date(y, m, d, h).toISOString()

  it('groupe par journée et nomme les deux plus récentes en relatif', () => {
    const groups = groupRowsByDate(
      [
        { id: 1, createdAt: at(2026, 7, 3) },
        { id: 2, createdAt: at(2026, 7, 3, 18) },
        { id: 3, createdAt: at(2026, 7, 2) },
        { id: 4, createdAt: at(2026, 6, 27) },
      ],
      'createdAt',
      now
    )

    expect(groups.map(g => g.label)).toEqual(["Aujourd'hui", 'Hier', 'Lundi 27 juillet'])
    expect(groups.map(g => g.data.length)).toEqual([2, 1, 1])
  })

  it("suit l'ordre d'entrée, donc la direction du tri amont", () => {
    const ascending = groupRowsByDate(
      [
        { id: 1, createdAt: at(2026, 6, 27) },
        { id: 2, createdAt: at(2026, 7, 3) },
      ],
      'createdAt',
      now
    )

    expect(ascending.map(g => g.label)).toEqual(['Lundi 27 juillet', "Aujourd'hui"])
  })

  it("ajoute l'année seulement hors de l'année en cours", () => {
    const groups = groupRowsByDate([{ id: 1, createdAt: at(2025, 10, 12) }], 'createdAt', now)
    expect(groups[0].label).toContain('2025')
  })

  it('respecte le champ de date demandé', () => {
    const row = { id: 1, createdAt: at(2026, 6, 27), updatedAt: at(2026, 7, 3) }

    expect(groupRowsByDate([row], 'createdAt', now)[0].label).toBe('Lundi 27 juillet')
    expect(groupRowsByDate([row], 'updatedAt', now)[0].label).toBe("Aujourd'hui")
  })

  it('isole les bâtiments sans date exploitable', () => {
    const groups = groupRowsByDate(
      [{ id: 1, createdAt: null }, { id: 2, createdAt: 'pas-une-date' }, { id: 3 }],
      'createdAt',
      now
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Date inconnue')
    expect(groups[0].data).toHaveLength(3)
  })

  it('tolère une liste absente', () => {
    expect(groupRowsByDate(null, 'createdAt', now)).toEqual([])
  })
})

describe('dayGroupLabel', () => {
  const now = new Date(2026, 7, 3, 9, 0, 0)

  it('nomme aujourd’hui et hier quelle que soit l’heure', () => {
    expect(dayGroupLabel(new Date(2026, 7, 3, 23, 59), now)).toBe("Aujourd'hui")
    expect(dayGroupLabel(new Date(2026, 7, 2, 0, 1), now)).toBe('Hier')
  })

  it('gère le passage de mois pour hier', () => {
    expect(dayGroupLabel(new Date(2026, 6, 31), new Date(2026, 7, 1, 12))).toBe('Hier')
  })
})

describe('filterByAddress', () => {
  it('ignore la casse et les espaces de bord', () => {
    expect(filterByAddress(rows(30), '  12 RUE ')).toHaveLength(1)
  })

  it('rend tout quand le terme est vide', () => {
    expect(filterByAddress(rows(7), '   ')).toHaveLength(7)
  })
})
