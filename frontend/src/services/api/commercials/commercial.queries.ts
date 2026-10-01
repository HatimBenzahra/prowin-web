/**
 * @fileoverview Commercial related GraphQL queries
 */

export const GET_COMMERCIALS = `
  query GetCommercials {
    commercials {
      id
      nom
      prenom
      email
      numTel
      age
      managerId
      directeurId
      status
      createdAt
      updatedAt
      statistics {
        id
        commercialId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        createdAt
        updatedAt
      }
    }
  }
`

export const GET_COMMERCIAL = `
  query GetCommercial($id: Int!) {
    commercial(id: $id) {
      id
      nom
      prenom
      email
      numTel
      age
      managerId
      directeurId
      status
      createdAt
      updatedAt
    }
  }
`

export const GET_COMMERCIAL_TEAM_RANKING = `
  query GetCommercialTeamRanking($commercialId: Int!) {
    commercialTeamRanking(commercialId: $commercialId) {
      position
      total
      points
      trend
      managerNom
      managerPrenom
      managerEmail
      managerNumTel
    }
  }
`

export const GET_COMMERCIAL_FULL = `
  query GetCommercialFull($id: Int!) {
    commercial(id: $id) {
      id
      nom
      prenom
      email
      numTel
      age
      managerId
      directeurId
      status
      createdAt
      updatedAt
      immeubles {
        id
        adresse
        typeHabitat
        nbEtages
        nbPortesParEtage
        nbMaisonsPrevu
        ascenseurPresent
        digitalCode
        commercialId
        zoneId
        createdAt
        updatedAt
        portes {
          id
          numero
          etage
          statut
          nbRepassages
          nbContrats
          rdvDate
          rdvTime
          derniereVisite
          coachingFavori
        }
      }
      zones {
        id
        nom
        xOrigin
        yOrigin
        rayon
        directeurId
        managerId
        createdAt
        updatedAt
      }
      statistics {
        id
        commercialId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        absents
        argumentes
        nbImmeublesProspectes
        nbPortesProspectes
        createdAt
        updatedAt
      }
    }
  }
`
