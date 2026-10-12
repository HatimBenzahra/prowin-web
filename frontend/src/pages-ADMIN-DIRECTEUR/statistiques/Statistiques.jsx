import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionTitle } from '@/components/details/DetailPrimitives'
import { RefreshCw } from 'lucide-react'
import { useStatistiquesLogic } from './useStatistiquesLogic'
import { TABS } from './stats-tabs'
import StatsFilters from './components/StatsFilters'
import StatsKpiRow from './components/StatsKpiRow'
import ActivityTrendCard from './components/ActivityTrendCard'
import OutcomesCard from './components/OutcomesCard'
import ConversionFunnelCard from './components/ConversionFunnelCard'
import SigneVsValideCard from './components/SigneVsValideCard'
import EffortCard from './components/EffortCard'
import CoachingScoreboardCard from './components/CoachingScoreboardCard'
import CoachingStepsCard from './components/CoachingStepsCard'
import CoachingVsConversionCard from './components/CoachingVsConversionCard'
import TeamComparisonTable from './components/TeamComparisonTable'
import TerritoryCard from './components/TerritoryCard'
import PipelineOverviewCard from './components/PipelineOverviewCard'
import PipelineRdvCard from './components/PipelineRdvCard'
import PipelineRepassageCard from './components/PipelineRepassageCard'
import PipelineHabitatCard from './components/PipelineHabitatCard'

/**
 * Statistiques : pilotage de la conversion dans le temps.
 *
 * La page porte beaucoup de données — activité, contrats, coaching, effort,
 * territoire — d'où une structure en trois niveaux plutôt qu'un empilement :
 *
 * 1. **Bandeau permanent** : filtres puis rangée de KPI comparés. Toujours visible,
 *    il donne l'état d'ensemble et le contexte de lecture des onglets.
 * 2. **Onglets** : un onglet par question. C'est ce qui permet d'aller en
 *    profondeur sur chaque sujet sans produire une page de dix écrans où plus rien
 *    ne se trouve. Le motif est déjà celui des fiches Commercial.
 * 3. **Cartes** : une carte = une question, chacune autonome.
 *
 * Les filtres sont partagés par tous les onglets : changer d'onglet ne perd jamais
 * la période ni le périmètre.
 *
 * Ce que la page ne fait pas, volontairement : le classement et les points (page
 * Classement, sur les snapshots WinLeadPlus), la gestion des zones (page Zones), le
 * temps réel du jour (Dashboard).
 */
/**
 * Squelette du contenu d'un onglet, le temps de sa première requête. Sans lui, les
 * cartes s'afficheraient d'abord vides et annonceraient « aucune donnée ».
 */
function TabSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
        <Skeleton className="h-[260px] w-full rounded-xl" />
        <Skeleton className="h-[260px] w-full rounded-xl" />
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map(tile => (
          <Skeleton key={tile} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
        <Skeleton className="h-[360px] w-full rounded-xl" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
    </div>
  )
}

export default function Statistiques() {
  const {
    loading,
    fetching,
    tabLoading,
    tab,
    setTab,
    error,
    dateFilter,
    scopeType,
    setScopeType,
    selectedOwner,
    setSelectedOwner,
    ownerOptions,
    activeFiltersCount,
    resetScope,
    periodLabel,
    scopeLabel,
    granularity,
    current,
    previous,
    timeline,
    ownerActivity,
    effort,
    contratsValides,
    pipeline,
    zoneStats,
    scoreboard,
    scoreboardLoading,
  } = useStatistiquesLogic()

  if (loading) return <PageSkeleton />

  if (error) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 text-destructive" />
          <p className="font-medium text-destructive">Erreur lors du chargement des statistiques</p>
          <p className="mt-2 text-sm text-muted-foreground">Veuillez réessayer plus tard</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="flex items-center gap-2 text-base text-muted-foreground">
          <span>
            Progression, conversion et effort — {scopeLabel.toLowerCase()} · {periodLabel}
          </span>
          {fetching && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3 animate-spin" />
              actualisation
            </span>
          )}
        </p>
      </div>

      <StatsFilters
        dateFilter={dateFilter}
        scopeType={scopeType}
        setScopeType={setScopeType}
        selectedOwner={selectedOwner}
        setSelectedOwner={setSelectedOwner}
        ownerOptions={ownerOptions}
        activeFiltersCount={activeFiltersCount}
        resetScope={resetScope}
      />

      <StatsKpiRow current={current} previous={previous} contratsValides={contratsValides} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map(item => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/*
          Pipeline : le travail qui reste ouvert, à l'instant présent.
          Placé en premier parce que c'est ce sur quoi on agit — les autres onglets
          racontent ce qui s'est passé. Ce bloc ignore le filtre de période : un stock
          se lit maintenant.
        */}
        <TabsContent value="pipeline" className="space-y-6">
          {tabLoading ? (
            <TabSkeleton />
          ) : (
            <>
              <PipelineOverviewCard pipeline={pipeline} />
              <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-2">
                <PipelineRdvCard rdv={pipeline?.rdv} />
                <PipelineRepassageCard
                  repassages={pipeline?.repassages}
                  reprise={pipeline?.reprise}
                />
              </div>
              <PipelineHabitatCard habitat={pipeline?.habitat} />
            </>
          )}
        </TabsContent>

        {/* Activité : la tendance, puis où vont les portes, puis où ça bloque. */}
        <TabsContent value="activite" className="space-y-6">
          {tabLoading ? (
            <TabSkeleton />
          ) : (
            <>
              <ActivityTrendCard timeline={timeline} periodLabel={periodLabel} />
              <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
                <OutcomesCard current={current} />
                <ConversionFunnelCard current={current} contratsValides={contratsValides} />
              </div>
              <div>
                <SectionTitle>Effort</SectionTitle>
                <EffortCard effort={effort} />
              </div>
            </>
          )}
        </TabsContent>

        {/* Contrats : l'écart entre ce qui est annoncé et ce qui est confirmé. */}
        <TabsContent value="contrats" className="space-y-6">
          {tabLoading ? (
            <TabSkeleton />
          ) : (
            <SigneVsValideCard
              timeline={timeline}
              contratsValides={contratsValides}
              granularity={granularity}
            />
          )}
        </TabsContent>

        {/* Coaching : comparer les intervenants, puis comprendre sur quoi. */}
        <TabsContent value="coaching" className="space-y-6">
          {tabLoading ? (
            <TabSkeleton />
          ) : (
            <>
              <CoachingScoreboardCard scoreboard={scoreboard} loading={scoreboardLoading} />
              <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-2">
                <CoachingStepsCard scoreboard={scoreboard} loading={scoreboardLoading} />
                <CoachingVsConversionCard scoreboard={scoreboard} ownerActivity={ownerActivity} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="equipe" className="space-y-6">
          {tabLoading ? (
            <TabSkeleton />
          ) : (
            <TeamComparisonTable
              ownerActivity={ownerActivity}
              scoreboard={scoreboard}
              current={current}
            />
          )}
        </TabsContent>

        <TabsContent value="territoire" className="space-y-6">
          {tabLoading ? <TabSkeleton /> : <TerritoryCard zoneStats={zoneStats} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
