/**
 * @fileoverview Statistic related GraphQL queries
 */

export const GET_STATISTICS = `
  query GetStatistics($commercialId: Int) {
    statistics(commercialId: $commercialId) {
      id
      commercialId
      managerId
      immeubleId
      zoneId
      contratsSignes
      immeublesVisites
      absents
      argumentes
      rendezVousPris
      refus
      nbImmeublesProspectes
      nbPortesProspectes
      createdAt
      updatedAt
    }
  }
`

export const GET_STATISTIC = `
  query GetStatistic($id: Int!) {
    statistic(id: $id) {
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
`

export const GET_ZONE_STATISTICS = `
  query GetZoneStatistics {
    zoneStatistics {
      zoneId
      zoneName
      totalContratsSignes
      totalImmeublesVisites
      totalRendezVousPris
      totalRefus
      totalImmeublesProspectes
      totalPortesProspectes
      tauxConversion
      tauxSuccesRdv
      nombreCommerciaux
      performanceGlobale
    }
  }
`

export const GET_TEAM_LAST_STATUS_ACTIVITIES = `
  query GetTeamLastStatusActivities {
    teamLastStatusActivities {
      userId
      userType
      userName
      statut
      changedAt
      porteId
      porteNumero
      immeubleId
      immeubleAdresse
    }
  }
`

export const GET_STATS_TIMELINE = `
  query GetStatsTimeline(
    $scopeType: String
    $ownerType: String
    $ownerId: Int
    $startDate: DateTime
    $endDate: DateTime
  ) {
    statsTimeline(
      scopeType: $scopeType
      ownerType: $ownerType
      ownerId: $ownerId
      startDate: $startDate
      endDate: $endDate
    ) {
      date
      rdvPris
      portesProspectees
      contratsSignes
      refus
      absents
      argumentes
      repassages
    }
  }
`

export const GET_STATS_ACTIVITY_BY_OWNER = `
  query GetStatsActivityByOwner(
    $scopeType: String
    $ownerType: String
    $ownerId: Int
    $startDate: DateTime
    $endDate: DateTime
  ) {
    statsActivityByOwner(
      scopeType: $scopeType
      ownerType: $ownerType
      ownerId: $ownerId
      startDate: $startDate
      endDate: $endDate
    ) {
      userId
      userType
      userName
      contratsSignes
      rendezVousPris
      refus
      absents
      argumentes
      repassages
      nbPortesProspectes
      tauxConversion
      points
      lastActivityAt
    }
  }
`

const PERIOD_TOTALS_FIELDS = `
  startDate
  endDate
  contratsSignes
  rendezVousPris
  refus
  absents
  argumentes
  repassages
  nbPortesProspectes
  nbPortesDistinctes
  nbIntervenants
  nbJoursActifs
  tauxConversion
  tauxContact
  tauxRdv
`

export const GET_STATS_PERIOD_COMPARISON = `
  query GetStatsPeriodComparison(
    $scopeType: String
    $ownerType: String
    $ownerId: Int
    $startDate: DateTime
    $endDate: DateTime
  ) {
    statsPeriodComparison(
      scopeType: $scopeType
      ownerType: $ownerType
      ownerId: $ownerId
      startDate: $startDate
      endDate: $endDate
    ) {
      current { ${PERIOD_TOTALS_FIELDS} }
      previous { ${PERIOD_TOTALS_FIELDS} }
    }
  }
`

export const GET_STATS_EFFORT = `
  query GetStatsEffort(
    $scopeType: String
    $ownerType: String
    $ownerId: Int
    $startDate: DateTime
    $endDate: DateTime
  ) {
    statsEffort(
      scopeType: $scopeType
      ownerType: $ownerType
      ownerId: $ownerId
      startDate: $startDate
      endDate: $endDate
    ) {
      nbPassagesMesures
      nbPassagesSansDuree
      dureeTotaleSec
      dureeMoyenneParPassageSec
      dureeMedianeParPassageSec
      dureeParContratSignesSec
      dureeParRdvSec
      passagesParHeure
    }
  }
`

export const GET_CONTRATS_VALIDES_AGGREGATE = `
  query GetContratsValidesAggregate(
    $scopeType: String
    $ownerType: String
    $ownerId: Int
    $startDate: DateTime
    $endDate: DateTime
    $granularity: String
  ) {
    contratsValidesAggregate(
      scopeType: $scopeType
      ownerType: $ownerType
      ownerId: $ownerId
      startDate: $startDate
      endDate: $endDate
      granularity: $granularity
    ) {
      total
      totalPrevious
      series { periodKey contratsValides }
      delaiMedianValidationJours
      nbSansDateSignature
    }
  }
`

export const GET_PROSPECTION_PIPELINE = `
  query GetProspectionPipeline($scopeType: String, $ownerType: String, $ownerId: Int) {
    prospectionPipeline(scopeType: $scopeType, ownerType: $ownerType, ownerId: $ownerId) {
      repassages {
        total
        plusAncienJours
        buckets { label count }
      }
      rdv {
        total
        aujourdhui
        aVenir
        enRetard
        sansDate
        plusEnRetardJours
      }
      conclusions {
        contratsSignes
        argumentes
        refus
        total
      }
      nonVisitees
      habitat {
        typeHabitat
        batiments
        portesCreees
        capaciteDeclaree
        prospectees
        aTraiter
        couverture
      }
      reprise {
        portesPasseesParAbsent
        portesConclues
        portesEncoreAbsentes
        tauxReprise
      }
    }
  }
`

export const GET_ME = `
  query Me {
    me {
      id
      role
      email
    }
  }
`
