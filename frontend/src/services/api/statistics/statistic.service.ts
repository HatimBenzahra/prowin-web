/**
 * @fileoverview Statistic API Service
 */

import { gql } from '../../core/graphql'
import {
  GET_STATISTICS,
  GET_STATISTIC,
  GET_ZONE_STATISTICS,
  GET_TEAM_LAST_STATUS_ACTIVITIES,
  GET_STATS_TIMELINE,
  GET_STATS_ACTIVITY_BY_OWNER,
  GET_STATS_PERIOD_COMPARISON,
  GET_STATS_EFFORT,
  GET_CONTRATS_VALIDES_AGGREGATE,
  GET_PROSPECTION_PIPELINE,
  GET_ME,
} from './statistic.queries'
import {
  CREATE_STATISTIC,
  UPDATE_STATISTIC,
  REMOVE_STATISTIC,
  RECALCULATE_ALL_STATS,
  VALIDATE_STATS_COHERENCE,
} from './statistic.mutations'
import { GET_CURRENT_USER_ASSIGNMENT } from '../zones/zone.queries' // Importing this from zones as it is used here
import type {
  Statistic,
  TimelinePoint,
  OwnerActivityStatistic,
  StatsPeriodComparison,
  StatsEffort,
  ContratsValidesAggregate,
  ProspectionPipeline,
  ZoneStatistic,
  TeamLastStatusActivity,
  QueryStatisticsResponse,
  QueryStatisticResponse,
  QueryZoneStatisticsResponse,
  QueryTeamLastStatusActivitiesResponse,
  QueryStatsTimelineResponse,
  QueryStatsActivityByOwnerResponse,
  QueryStatsPeriodComparisonResponse,
  QueryStatsEffortResponse,
  QueryContratsValidesAggregateResponse,
  QueryProspectionPipelineResponse,
  CreateStatisticVariables,
  MutationCreateStatisticResponse,
  UpdateStatisticVariables,
  MutationUpdateStatisticResponse,
  MutationRemoveStatisticResponse,
  GetEntityByIdVariables,
} from './statistic.types'

export interface StatsActivityFilters {
  scopeType?: string
  ownerType?: string
  ownerId?: number
  startDate?: string
  endDate?: string
}

/** Granularité de regroupement des contrats validés. */
export type ContratsValidesGranularity = 'day' | 'week' | 'month'

export interface ContratsValidesFilters extends StatsActivityFilters {
  granularity?: ContratsValidesGranularity
}

export const statisticApi = {
  async getAll(commercialId?: number): Promise<Statistic[]> {
    const response = await gql<QueryStatisticsResponse, { commercialId?: number }>(GET_STATISTICS, {
      commercialId,
    })
    return response.statistics
  },

  async getById(id: number): Promise<Statistic> {
    const response = await gql<QueryStatisticResponse, GetEntityByIdVariables>(GET_STATISTIC, {
      id,
    })
    return response.statistic
  },

  async create(input: CreateStatisticVariables['createStatisticInput']): Promise<Statistic> {
    const response = await gql<MutationCreateStatisticResponse, CreateStatisticVariables>(
      CREATE_STATISTIC,
      { createStatisticInput: input }
    )
    return response.createStatistic
  },

  async update(input: UpdateStatisticVariables['updateStatisticInput']): Promise<Statistic> {
    const response = await gql<MutationUpdateStatisticResponse, UpdateStatisticVariables>(
      UPDATE_STATISTIC,
      { updateStatisticInput: input }
    )
    return response.updateStatistic
  },

  async remove(id: number): Promise<Statistic> {
    const response = await gql<MutationRemoveStatisticResponse, GetEntityByIdVariables>(
      REMOVE_STATISTIC,
      { id }
    )
    return response.removeStatistic
  },

  async getZoneStatistics(): Promise<ZoneStatistic[]> {
    const response = await gql<QueryZoneStatisticsResponse, {}>(GET_ZONE_STATISTICS, {})
    return response.zoneStatistics
  },

  async getTeamLastStatusActivities(): Promise<TeamLastStatusActivity[]> {
    const response = await gql<QueryTeamLastStatusActivitiesResponse, {}>(
      GET_TEAM_LAST_STATUS_ACTIVITIES,
      {}
    )
    return response.teamLastStatusActivities
  },

  async getStatsTimeline(filters: StatsActivityFilters = {}): Promise<TimelinePoint[]> {
    const response = await gql<QueryStatsTimelineResponse, StatsActivityFilters>(
      GET_STATS_TIMELINE,
      filters
    )
    return response.statsTimeline
  },

  async getStatsActivityByOwner(
    filters: StatsActivityFilters = {}
  ): Promise<OwnerActivityStatistic[]> {
    const response = await gql<QueryStatsActivityByOwnerResponse, StatsActivityFilters>(
      GET_STATS_ACTIVITY_BY_OWNER,
      filters
    )
    return response.statsActivityByOwner
  },

  async getStatsPeriodComparison(
    filters: StatsActivityFilters = {}
  ): Promise<StatsPeriodComparison> {
    const response = await gql<QueryStatsPeriodComparisonResponse, StatsActivityFilters>(
      GET_STATS_PERIOD_COMPARISON,
      filters
    )
    return response.statsPeriodComparison
  },

  async getStatsEffort(filters: StatsActivityFilters = {}): Promise<StatsEffort> {
    const response = await gql<QueryStatsEffortResponse, StatsActivityFilters>(
      GET_STATS_EFFORT,
      filters
    )
    return response.statsEffort
  },

  async getContratsValidesAggregate(
    filters: ContratsValidesFilters = {}
  ): Promise<ContratsValidesAggregate> {
    const response = await gql<QueryContratsValidesAggregateResponse, ContratsValidesFilters>(
      GET_CONTRATS_VALIDES_AGGREGATE,
      filters
    )
    return response.contratsValidesAggregate
  },

  /**
   * Stock de travail courant. Ne prend délibérément pas de bornes de dates : les
   * filtres de période de la page ne s'appliquent pas à un stock.
   */
  async getProspectionPipeline(
    filters: Pick<StatsActivityFilters, 'scopeType' | 'ownerType' | 'ownerId'> = {}
  ): Promise<ProspectionPipeline> {
    const response = await gql<QueryProspectionPipelineResponse, typeof filters>(
      GET_PROSPECTION_PIPELINE,
      filters
    )
    return response.prospectionPipeline
  },

  async getCurrentUserAssignment(userId: number, userType: string): Promise<any> {
    const response = await gql<any, { userId: number; userType: string }>(
      GET_CURRENT_USER_ASSIGNMENT,
      { userId, userType }
    )
    return response.currentUserAssignment
  },

  async recalculateAllStats(): Promise<string> {
    const response = await gql<{ recalculateAllStats: string }>(RECALCULATE_ALL_STATS)
    return response.recalculateAllStats
  },

  async validateStatsCoherence(): Promise<string> {
    const response = await gql<{ validateStatsCoherence: string }>(VALIDATE_STATS_COHERENCE)
    return response.validateStatsCoherence
  },
}

export const authApi = {
  /**
   * Récupère les informations de l'utilisateur connecté depuis le JWT
   */
  async getMe() {
    const data = await gql<{ me: any }>(GET_ME)
    return data.me
  },
}
