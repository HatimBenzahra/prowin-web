import { describe, it, expect } from 'vitest'
import { isPorteFaitePar, portesFaitesPar } from './immeuble-membres'

describe('isPorteFaitePar', () => {
  it('compare dernierCommercialId pour un commercial', () => {
    const viewer = { type: 'COMMERCIAL', id: 4 }
    expect(isPorteFaitePar({ dernierCommercialId: 4 }, viewer)).toBe(true)
    expect(isPorteFaitePar({ dernierCommercialId: 5 }, viewer)).toBe(false)
    expect(isPorteFaitePar({ dernierManagerId: 4 }, viewer)).toBe(false)
  })

  it('compare dernierManagerId pour un manager', () => {
    const viewer = { type: 'MANAGER', id: 4 }
    expect(isPorteFaitePar({ dernierManagerId: 4 }, viewer)).toBe(true)
    expect(isPorteFaitePar({ dernierCommercialId: 4 }, viewer)).toBe(false)
  })

  it('ne rattache pas une porte sans auteur', () => {
    expect(isPorteFaitePar({}, { type: 'COMMERCIAL', id: 4 })).toBe(false)
  })
})

describe('portesFaitesPar', () => {
  const portes = [{ dernierCommercialId: 1 }, { dernierCommercialId: 2 }]
  it('filtre sur le viewer, sans viewer renvoie tout', () => {
    expect(portesFaitesPar(portes, { type: 'COMMERCIAL', id: 2 })).toEqual([portes[1]])
    expect(portesFaitesPar(portes, null)).toBe(portes)
  })
})
