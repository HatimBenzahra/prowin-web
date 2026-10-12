/**
 * @fileoverview Statistic API types
 */

export type {
  Statistic,
  TimelinePoint,
  OwnerActivityStatistic,
  StatsPeriodTotals,
  StatsPeriodComparison,
  StatsEffort,
  ContratsValidesPoint,
  ContratsValidesAggregate,
  ProspectionPipeline,
  ZoneStatistic,
  TeamLastStatusActivity,
} from '../../../types/api'

export type {
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
} from '../../../types/graphql'
