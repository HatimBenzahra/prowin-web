/**
 * @fileoverview Commercial related GraphQL mutations
 */

export const CREATE_COMMERCIAL = `
  mutation CreateCommercial($createCommercialInput: CreateCommercialInput!) {
    createCommercial(createCommercialInput: $createCommercialInput) {
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

export const UPDATE_COMMERCIAL = `
  mutation UpdateCommercial($updateCommercialInput: UpdateCommercialInput!) {
    updateCommercial(updateCommercialInput: $updateCommercialInput) {
      id
      nom
      prenom
      email
      numTel
      age
      managerId
      directeurId
      status
      niveau
      createdAt
      updatedAt
    }
  }
`

export const REMOVE_COMMERCIAL = `
  mutation RemoveCommercial($id: Int!) {
    removeCommercial(id: $id) {
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

export const ASSIGN_ZONE_TO_COMMERCIAL = `
  mutation AssignZoneToCommercial($commercialId: Int!, $zoneId: Int!) {
    assignZoneToCommercial(commercialId: $commercialId, zoneId: $zoneId)
  }
`

export const UNASSIGN_ZONE_FROM_COMMERCIAL = `
  mutation UnassignZoneFromCommercial($commercialId: Int!, $zoneId: Int!) {
    unassignZoneFromCommercial(commercialId: $commercialId, zoneId: $zoneId)
  }
`
