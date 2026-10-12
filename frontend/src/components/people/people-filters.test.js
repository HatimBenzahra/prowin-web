import { describe, it, expect } from 'vitest'
import { filterPeople } from './people-filters'

const PEOPLE = [
  { id: 1, prenom: 'Denise', nom: 'Afana', status: 'ACTIF' },
  { id: 2, prenom: 'Marcelle', nom: 'Woppiwo', status: 'ACTIF' },
  { id: 3, prenom: 'Odette', nom: 'Yinda', status: 'CONTRAT_FINIE' },
  { id: 4, prenom: 'Test', nom: 'Bachellier', status: 'UTILISATEUR_TEST' },
]

describe('filterPeople', () => {
  it('filtre sur le statut demandé', () => {
    expect(filterPeople(PEOPLE, { status: 'ACTIF' })).toHaveLength(2)
    expect(filterPeople(PEOPLE, { status: 'UTILISATEUR_TEST' })).toHaveLength(1)
  })

  it('ne filtre rien sur « all »', () => {
    expect(filterPeople(PEOPLE, { status: 'all' })).toHaveLength(4)
  })

  it('cherche sur le prénom comme sur le nom, insensible à la casse', () => {
    expect(filterPeople(PEOPLE, { search: 'afana', status: 'all' })).toHaveLength(1)
    expect(filterPeople(PEOPLE, { search: 'ODETTE', status: 'all' })).toHaveLength(1)
  })

  it('cherche sur le nom complet, prénom puis nom', () => {
    expect(filterPeople(PEOPLE, { search: 'denise afana', status: 'all' })).toHaveLength(1)
  })

  it('ignore les espaces de bord', () => {
    expect(filterPeople(PEOPLE, { search: '   woppiwo  ', status: 'all' })).toHaveLength(1)
  })

  it('combine statut et recherche', () => {
    // Seule Marcelle Woppiwo est à la fois ACTIF et porteuse d'un « o ».
    expect(filterPeople(PEOPLE, { search: 'o', status: 'ACTIF' })).toHaveLength(1)
    // Odette existe mais n'est pas ACTIF : la combinaison doit être vide.
    expect(filterPeople(PEOPLE, { search: 'odette', status: 'ACTIF' })).toHaveLength(0)
  })

  it('tolère une liste absente et des champs manquants', () => {
    expect(filterPeople(null, { status: 'ACTIF' })).toEqual([])
    expect(filterPeople([{ id: 9, status: 'ACTIF' }], { search: 'x', status: 'all' })).toEqual([])
  })

  it('rend tout sans filtre explicite', () => {
    expect(filterPeople(PEOPLE)).toHaveLength(4)
  })
})
