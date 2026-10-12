/**
 * @fileoverview Manager related GraphQL queries
 */

export const GET_MANAGERS = `
  query GetManagers {
    managers {
      id
      nom
      prenom
      email
      numTelephone
      directeurId
      status
      createdAt
      updatedAt
      statistics {
        id
        commercialId
        managerId
        immeubleId
        zoneId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        nbImmeublesProspectes
        nbPortesProspectes
        createdAt
        updatedAt
      }
    }

  }
`

export const GET_MANAGER = `
  query GetManager($id: Int!) {
    manager(id: $id) {
      id
      nom
      prenom
      email
      numTelephone
      directeurId
      status
      createdAt
      updatedAt
    }
  }
`

export const GET_MANAGER_PERSONAL = `
  query GetManagerPersonal($id: Int!) {
    managerPersonal(id: $id) {
      id
      nom
      prenom
      email
      numTelephone
      directeurId
      status
      createdAt
      updatedAt
      directeur {
        id
        nom
        prenom
        email
        numTelephone
        status
      }
      immeubles {
        id
        adresse
        typeHabitat
        nbEtages
        nbPortesParEtage
        nbMaisonsPrevu
        ascenseurPresent
        digitalCode
        latitude
        longitude
        commercialId
        managerId
        zoneId
        createdAt
        updatedAt
        portes {
          id
          numero
          etage
          statut
          nbRepassages
          rdvDate
          rdvTime
          derniereVisite
          coachingFavori
        }
      }
      statistics {
        id
        commercialId
        managerId
        immeubleId
        zoneId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        nbImmeublesProspectes
        nbPortesProspectes
        createdAt
        updatedAt
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
    }
  }
`

export const GET_MANAGER_FULL = `
  query GetManagerFull($id: Int!) {
    managerFull(id: $id) {
      id
      nom
      prenom
      email
      numTelephone
      directeurId
      status
      createdAt
      updatedAt
      directeur {
        id
        nom
        prenom
        email
        numTelephone
        status
      }
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
          managerId
          immeubleId
          zoneId
          contratsSignes
          immeublesVisites
          rendezVousPris
          refus
          nbImmeublesProspectes
          nbPortesProspectes
          createdAt
          updatedAt
        }
        immeubles {
          id
          adresse
          nbEtages
          nbPortesParEtage
          ascenseurPresent
          digitalCode
          commercialId
          zoneId
          createdAt
          updatedAt
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
          immeubles {
            id
            adresse
            nbEtages
            nbPortesParEtage
            createdAt
            updatedAt
          }
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
        immeubles {
          id
          adresse
          nbEtages
          nbPortesParEtage
          createdAt
          updatedAt
        }
      }
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
        managerId
        zoneId
        createdAt
        updatedAt
      }

      personalStatistics {
        id
        commercialId
        managerId
        immeubleId
        zoneId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        nbImmeublesProspectes
        nbPortesProspectes
        createdAt
        updatedAt
      }
      teamStatistics {
        id
        commercialId
        managerId
        immeubleId
        zoneId
        contratsSignes
        immeublesVisites
        rendezVousPris
        refus
        nbImmeublesProspectes
        nbPortesProspectes
        createdAt
        updatedAt
      }
    }
  }
`
