/**
 * @fileoverview Porte related GraphQL queries
 */

export const GET_PORTES = `
  query GetPortes {
    portes {
      id
      numero
      nomPersonnalise
      etage
      immeubleId
      statut
      nbRepassages
      nbContrats
      rdvDate
      rdvTime
      commentaire
      derniereVisite
      createdAt
      updatedAt
    }
  }
`

export const GET_PORTE = `
  query GetPorte($id: Int!) {
    porte(id: $id) {
      id
      numero
      nomPersonnalise
      etage
      immeubleId
      statut
      nbRepassages
      nbContrats
      rdvDate
      rdvTime
      commentaire
      derniereVisite
      createdAt
      updatedAt
    }
  }
`

export const GET_PORTES_BY_IMMEUBLE = `
  query GetPortesByImmeuble($immeubleId: Int!, $skip: Int, $take: Int, $etage: Int) {
    portesByImmeuble(immeubleId: $immeubleId, skip: $skip, take: $take, etage: $etage) {
      id
      numero
      nomPersonnalise
      etage
      immeubleId
      statut
      nbRepassages
      nbContrats
      rdvDate
      rdvTime
      commentaire
      derniereVisite
      coachingFavori
      createdAt
      updatedAt
    }
  }
`

export const GET_PORTES_MODIFIED_TODAY = `
  query GetPortesModifiedToday($immeubleId: Int) {
    portesModifiedToday(immeubleId: $immeubleId) {
      id
      numero
      nomPersonnalise
      etage
      immeubleId
      statut
      nbRepassages
      nbContrats
      rdvDate
      rdvTime
      commentaire
      derniereVisite
      createdAt
      updatedAt
    }
  }
`

export const GET_PORTE_STATISTICS = `
  query GetPorteStatistics($immeubleId: Int!) {
    porteStatistics(immeubleId: $immeubleId) {
      totalPortes
      contratsSigne
      rdvPris
      absent
      argumente
      refus
      nonVisitees
      necessiteRepassage
      portesVisitees
      tauxConversion
      portesParEtage {
        etage
        count
      }
    }
  }
`

export const GET_PORTES_RDV_TODAY = `
  query GetPortesRdvToday {
    portesRdvToday {
      id
      numero
      nomPersonnalise
      etage
      immeubleId
      statut
      nbRepassages
      nbContrats
      rdvDate
      rdvTime
      commentaire
      derniereVisite
      createdAt
      updatedAt
    }
  }
`

export const GET_STATUS_HISTORIQUE_BY_PORTE = `
  query StatusHistoriqueByPorte($porteId: Int!) {
    statusHistoriqueByPorte(porteId: $porteId) {
      id
      porteId
      statut
      commentaire
      rdvDate
      rdvTime
      createdAt
      commercial {
        id
        nom
        prenom
      }
      manager {
        id
        nom
        prenom
      }
    }
  }
`

export const GET_STATUS_HISTORIQUE_BY_IMMEUBLE = `
  query StatusHistoriqueByImmeuble($immeubleId: Int!) {
    statusHistoriqueByImmeuble(immeubleId: $immeubleId) {
      id
      porteId
      statut
      commentaire
      rdvDate
      rdvTime
      createdAt
      porte {
        id
        numero
        etage
      }
      commercial {
        id
        nom
        prenom
      }
      manager {
        id
        nom
        prenom
      }
    }
  }
`

export const GET_RECORDING_SEGMENTS_BY_IMMEUBLE = `
  query RecordingSegmentsByImmeuble($immeubleId: Int!) {
    recordingSegmentsByImmeuble(immeubleId: $immeubleId) {
      id
      porteId
      porteNumero
      porteEtage
      statut
      startTime
      endTime
      durationSec
      transcription
      speechScore
      status
      streamingUrl
      createdAt
    }
  }
`

export const GET_RECORDING_SEGMENTS_BY_COMMERCIAL = `
  query RecordingSegmentsByCommercial($commercialId: Int!) {
    recordingSegmentsByCommercial(commercialId: $commercialId) {
      id
      porteId
      porteNumero
      porteEtage
      immeubleId
      immeubleAdresse
      commercialId
      managerId
      commercialNom
      s3KeySegment
      statut
      startTime
      endTime
      durationSec
      transcription
      speechScore
      status
      createdAt
    }
  }
`

export const GET_RECORDING_SEGMENTS_BY_MANAGER = `
  query RecordingSegmentsByManager($managerId: Int!) {
    recordingSegmentsByManager(managerId: $managerId) {
      id
      porteId
      porteNumero
      porteEtage
      immeubleId
      immeubleAdresse
      commercialId
      managerId
      commercialNom
      s3KeySegment
      statut
      startTime
      endTime
      durationSec
      transcription
      speechScore
      status
      createdAt
    }
  }
`

export const GET_RECORDING_SEGMENTS_BY_PORTE = `
  query RecordingSegmentsByPorte($porteId: Int!) {
    recordingSegmentsByPorte(porteId: $porteId) {
      id
      porteId
      s3KeyOriginal
      s3KeySegment
      statut
      startTime
      endTime
      durationSec
      transcription
      speechScore
      status
      createdAt
    }
  }
`
