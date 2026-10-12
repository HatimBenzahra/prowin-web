/**
 * @fileoverview Zone related GraphQL queries
 */

export const GET_ZONES = `
  query GetZones {
    zones {
      id
      nom
      polygon
      xOrigin
      yOrigin
      rayon
      directeurId
      managerId
      immeubles {
        id
        adresse
        typeHabitat
        latitude
        longitude
        nbEtages
        nbPortesParEtage
        nbMaisonsPrevu
        commercialId
        zoneId
      }
      createdAt
      updatedAt
    }
  }
`

export const GET_ZONES_WITH_COMMERCIALS = `
  query GetZonesWithCommercials {
    commercials {
      id
      nom
      prenom
      zones {
        id
        nom
        polygon
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

export const GET_ZONE = `
  query GetZone($id: Int!) {
    zone(id: $id) {
      id
      nom
      polygon
      xOrigin
      yOrigin
      rayon
      directeurId
      managerId
      immeubles {
        id
        adresse
        typeHabitat
        latitude
        longitude
        nbEtages
        nbPortesParEtage
        nbMaisonsPrevu
        commercialId
        zoneId
        portes {
          statut
          nbContrats
        }
      }
      createdAt
      updatedAt
    }
  }
`

export const GET_CURRENT_USER_ASSIGNMENT = `
  query GetCurrentUserAssignment($userId: Int!, $userType: UserType!) {
    currentUserAssignment(userId: $userId, userType: $userType) {
      id
      zoneId
      userId
      userType
      assignedAt
      zone {
        id
        nom
        polygon
        xOrigin
        yOrigin
        rayon
        createdAt
        updatedAt
      }
    }
  }
`

export const GET_ALL_ZONE_HISTORY = `
  query GetAllZoneHistory {
    allZoneHistory {
      id
      zoneId
      userId
      userType
      assignedAt
      unassignedAt
      totalContratsSignes
      totalImmeublesVisites
      totalRendezVousPris
      totalRefus
      totalImmeublesProspectes
      totalPortesProspectes
      zone {
        id
        nom
      }
    }
  }
`

export const GET_ALL_CURRENT_ASSIGNMENTS = `
  query GetAllCurrentAssignments {
    allCurrentAssignments {
      id
      zoneId
      userId
      userType
      assignedAt
      zone {
        id
        nom
        polygon
        xOrigin
        yOrigin
        rayon
        immeubles {
          id
          adresse
          latitude
          longitude
          nbEtages
          nbPortesParEtage
        }
      }
    }
  }
`

export const GET_ZONE_CURRENT_ASSIGNMENTS = `
  query GetZoneCurrentAssignments($zoneId: Int!) {
    zoneCurrentAssignments(zoneId: $zoneId) {
      id
      zoneId
      userId
      userType
      assignedAt
    }
  }
`
