/**
 * @fileoverview Hooks for Statistic entity
 */

import { api } from '../../../services/api'
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
  CreateStatisticInput,
  UpdateStatisticInput,
} from '../../../types/api'
import {
  useApiCall,
  useApiMutation,
  UseApiState,
  UseApiListState,
  UseApiActions,
  UseApiMutation,
} from './core'

export function useStatistics(): UseApiListState<Statistic> & UseApiActions {
  return useApiCall(() => api.statistics.getAll(undefined), [], 'statistics')
}

export function useStatisticsByCommercial(
  commercialId: number
): UseApiListState<Statistic> & UseApiActions {
  return useApiCall(() => api.statistics.getAll(commercialId), [commercialId], 'statistics')
}

export function useStatisticsByZone(zoneId: number): UseApiListState<Statistic> & UseApiActions {
  const result = useApiCall(() => api.statistics.getAll(undefined), [], 'statistics')

  // Filtrer les statistiques par zoneId côté client
  const filteredData = result.data?.filter(stat => stat.zoneId === zoneId) || []

  return {
    ...result,
    data: filteredData,
  }
}

/**
 * `options.enabled` sert aux pages à onglets : une requête d'onglet fermé ne part
 * pas. Attention côté appelant — une requête désactivée reste `pending` pour
 * react-query, donc son `loading` vaut `true` : il ne faut pas l'agréger dans un
 * drapeau de chargement global.
 */
type ApiCallOptions = { enabled?: boolean }

export function useZoneStatistics(
  options?: ApiCallOptions
): UseApiListState<ZoneStatistic> & UseApiActions {
  return useApiCall(() => api.statistics.getZoneStatistics(), [], 'zoneStatistics', options)
}

export function useTeamLastStatusActivities(): UseApiListState<TeamLastStatusActivity> &
  UseApiActions {
  return useApiCall(
    () => api.statistics.getTeamLastStatusActivities(),
    [],
    'teamLastStatusActivities'
  )
}

export function useStatsTimeline(
  filters = {},
  options?: ApiCallOptions
): UseApiListState<TimelinePoint> & UseApiActions {
  const key = JSON.stringify(filters)
  return useApiCall(() => api.statistics.getStatsTimeline(filters), [key], 'statsTimeline', options)
}

export function useStatsActivityByOwner(
  filters = {},
  options?: ApiCallOptions
): UseApiListState<OwnerActivityStatistic> & UseApiActions {
  const key = JSON.stringify(filters)
  return useApiCall(
    () => api.statistics.getStatsActivityByOwner(filters),
    [key],
    'statsActivityByOwner',
    options
  )
}

/**
 * Totaux de la période + période précédente de même durée.
 * `previous` est absent quand la plage n'est pas bornée des deux côtés.
 */
export function useStatsPeriodComparison(
  filters = {}
): UseApiState<StatsPeriodComparison> & UseApiActions {
  const key = JSON.stringify(filters)
  return useApiCall(
    () => api.statistics.getStatsPeriodComparison(filters),
    [key],
    'statsPeriodComparison'
  )
}

/** Effort terrain mesuré (durées de passage renseignées par le mobile). */
export function useStatsEffort(
  filters = {},
  options?: ApiCallOptions
): UseApiState<StatsEffort> & UseApiActions {
  return useApiCall(
    () => api.statistics.getStatsEffort(filters),
    [JSON.stringify(filters)],
    'statsEffort',
    options
  )
}

/** Contrats validés back-office, agrégés et comparés à la période précédente. */
export function useContratsValidesAggregate(
  filters = {}
): UseApiState<ContratsValidesAggregate> & UseApiActions {
  return useApiCall(
    () => api.statistics.getContratsValidesAggregate(filters),
    [JSON.stringify(filters)],
    'contratsValidesAggregate'
  )
}

/**
 * Stock de travail de prospection à l'instant présent.
 * Ne reçoit que le périmètre : un stock ne se filtre pas par période.
 */
export function useProspectionPipeline(
  filters = {},
  options?: ApiCallOptions
): UseApiState<ProspectionPipeline> & UseApiActions {
  return useApiCall(
    () => api.statistics.getProspectionPipeline(filters),
    [JSON.stringify(filters)],
    'prospectionPipeline',
    options
  )
}

export function useStatistic(id: number): UseApiState<Statistic> & UseApiActions {
  return useApiCall(() => api.statistics.getById(id), [id], 'statistics')
}

export function useCreateStatistic(): UseApiMutation<CreateStatisticInput, Statistic> {
  return useApiMutation(api.statistics.create, 'statistics')
}

export function useUpdateStatistic(): UseApiMutation<UpdateStatisticInput, Statistic> {
  return useApiMutation(api.statistics.update, 'statistics')
}

export function useRemoveStatistic(): UseApiMutation<number, Statistic> {
  return useApiMutation(api.statistics.remove, 'statistics')
}
