import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB, DEFERRABLE_QUERIES, TABS, TAB_QUERIES } from './stats-tabs'

describe('onglets de la page Statistiques', () => {
  it('déclare les besoins en données de chaque onglet', () => {
    // Un onglet absent de TAB_QUERIES n'obtiendrait aucune donnée, sans erreur ni
    // indicateur de chargement : le défaut serait silencieux.
    TABS.forEach(tab => {
      expect(TAB_QUERIES, `onglet « ${tab.label} » sans requêtes déclarées`).toHaveProperty(
        tab.value
      )
      expect(TAB_QUERIES[tab.value].length).toBeGreaterThan(0)
    })
  })

  it("n'attend pas de données pour un onglet qui n'existe pas", () => {
    expect(Object.keys(TAB_QUERIES).sort()).toEqual(TABS.map(tab => tab.value).sort())
  })

  it('ne référence que des requêtes différables connues', () => {
    Object.values(TAB_QUERIES)
      .flat()
      .forEach(query => {
        expect(DEFERRABLE_QUERIES).toContain(query)
      })
  })

  it('ouvre sur un onglet existant', () => {
    expect(TABS.map(tab => tab.value)).toContain(DEFAULT_TAB)
  })

  it('couvre chaque requête différable par au moins un onglet', () => {
    // Sinon la requête ne partirait jamais : du code mort déguisé en optimisation.
    const used = new Set(Object.values(TAB_QUERIES).flat())
    DEFERRABLE_QUERIES.forEach(query => {
      expect(used, `requête « ${query} » réclamée par aucun onglet`).toContain(query)
    })
  })
})
