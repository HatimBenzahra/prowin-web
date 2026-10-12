import React from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useProspectionCharts } from './useProspectionCharts'
import ProspectionOutcomesCard from './ProspectionOutcomesCard'
import TeamActivityCard from './TeamActivityCard'
import MonthlyPaceCard from './MonthlyPaceCard'

const GRID = 'grid grid-cols-1 gap-6 lg:grid-cols-3'

/**
 * Bloc graphes de prospection : la table d'activité par commercial ouvre le bloc
 * sur toute la largeur, puis le rythme du mois occupe deux colonnes et la
 * répartition des issues la troisième.
 * Hauteurs portées par le contenu, aucune classe `aspect-*` sur les conteneurs.
 */
export default function ProspectionCharts() {
  const { outcomes, pace, team, rollingDays, inactiveAfterDays, loading } = useProspectionCharts()

  if (loading) {
    return (
      <div className={GRID}>
        <Card className="gap-0 py-0 lg:col-span-3">
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-44" />
            {[0, 1, 2].map(row => (
              <Skeleton key={row} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </Card>
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-[220px] w-full rounded-lg" />
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-36" />
            {[0, 1, 2, 3, 4].map(row => (
              <Skeleton key={row} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className={GRID}>
      <div className="lg:col-span-3">
        <TeamActivityCard
          team={team}
          rollingDays={rollingDays}
          inactiveAfterDays={inactiveAfterDays}
        />
      </div>
      <div className="lg:col-span-2">
        <MonthlyPaceCard pace={pace} />
      </div>
      <ProspectionOutcomesCard outcomes={outcomes} rollingDays={rollingDays} />
    </div>
  )
}
