/**
 * @fileoverview Immeuble related GraphQL queries
 */

export const GET_IMMEUBLES = `
  query GetImmeubles {
    immeubles {
      id
      adresse
      typeHabitat
      latitude
      longitude
      nbEtages
      nbPortesParEtage
      nbMaisonsPrevu
      ascenseurPresent
      digitalCode
      commercialId
      managerId
      membres {
        id
        nom
        prenom
        type
      }
      quartierId
      portes {
        id
        statut
      }
      createdAt
      updatedAt
    }
  }
`

export const GET_IMMEUBLE = `
  query GetImmeuble($id: Int!) {
    immeuble(id: $id) {
      id
      adresse
      typeHabitat
      latitude
      longitude
      nbEtages
      nbPortesParEtage
      nbMaisonsPrevu
      ascenseurPresent
      digitalCode
      commercialId
      managerId
      membres {
        id
        nom
        prenom
        type
      }
      quartierId
      zoneId
      createdAt
      updatedAt
    }
  }
`

export const GET_QUARTIERS = `
  query GetQuartiers {
    quartiers {
      id
      nom
    }
  }
`
