import { useMemo } from 'react'
import { useStatsTimeline, useStatsActivityByOwner } from '@/hooks/metier/api/statistics'
import { aggregateOutcomes, buildMonthlyPace, rankTeamActivity } from './prospection-charts-utils'

/**
 * Fenêtre glissante plutôt que mois calendaire : le 1er et le 2 du mois, un mois
 * calendaire rendrait la répartition et le classement d'équipe vides.
 */
const ROLLING_DAYS = 30

/** Seuil au-delà duquel un commercial est signalé inactif dans le classement. */
const INACTIVE_AFTER_DAYS = 3

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function dayEnd(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/**
 * Données du bloc graphes de prospection.
 *
 * Quatre requêtes : la fenêtre glissante (répartition + classement d'équipe), le
 * mois en cours et le mois précédent (rythme). Le mois en cours ne peut pas être
 * dérivé de la fenêtre glissante : le 31, 30 jours en arrière ne couvrent plus le
 * 1er du mois. Les clés react-query intègrent les filtres sérialisés, les trois
 * appels timeline ne se confondent donc pas (core.ts:47).
 */
export function useProspectionCharts() {
  // Stable pour la durée du montage : évite que les plages changent à chaque rendu.
  const today = useMemo(() => new Date(), [])

  const rollingRange = useMemo(() => {
    const start = dayStart(today)
    start.setDate(start.getDate() - (ROLLING_DAYS - 1))
    return { startDate: start.toISOString(), endDate: dayEnd(today).toISOString() }
  }, [today])

  const currentMonthRange = useMemo(
    () => ({
      startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
      endDate: dayEnd(today).toISOString(),
    }),
    [today]
  )

  const previousMonthRange = useMemo(
    () => ({
      startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString(),
      endDate: dayEnd(new Date(today.getFullYear(), today.getMonth(), 0)).toISOString(),
    }),
    [today]
  )

  const { data: rollingPoints, loading: rollingLoading } = useStatsTimeline(rollingRange)
  const { data: currentPoints, loading: currentLoading } = useStatsTimeline(currentMonthRange)
  const { data: previousPoints, loading: previousLoading } = useStatsTimeline(previousMonthRange)
  const { data: owners, loading: ownersLoading } = useStatsActivityByOwner(rollingRange)

  // useApiCall renvoie `data: query.data ?? null` : la garde couvre le null, qu'une
  // valeur par défaut de paramètre laisserait passer.
  const outcomes = useMemo(() => aggregateOutcomes(rollingPoints || []), [rollingPoints])

  const pace = useMemo(
    () => buildMonthlyPace(currentPoints || [], previousPoints || [], today),
    [currentPoints, previousPoints, today]
  )

  const team = useMemo(
    () => rankTeamActivity(owners || [], { inactiveAfterDays: INACTIVE_AFTER_DAYS, now: today }),
    [owners, today]
  )

  return {
    outcomes,
    pace,
    team,
    rollingDays: ROLLING_DAYS,
    inactiveAfterDays: INACTIVE_AFTER_DAYS,
    loading: rollingLoading || currentLoading || previousLoading || ownersLoading,
  }
}
