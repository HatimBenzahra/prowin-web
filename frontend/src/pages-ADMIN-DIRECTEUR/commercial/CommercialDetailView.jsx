import { lazy, Suspense, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import GameIcon from '@/components/gamification/GameIcon'
import SplitLayout from '@/components/details/SplitLayout'
import { StatTile, SectionTitle, BuildingsTable } from '@/components/details/DetailPrimitives'
import { MapSkeleton, DetailsPageSkeleton } from '@/components/LoadingSkeletons'
import DateRangeFilter from '@/components/DateRangeFilter'
import ProspectionChartsSection from '@/components/details/ProspectionChartsSection'
import CoachingSynthesisSection from '@/pages-ADMIN-DIRECTEUR/coaching/CoachingSynthesisSection'
import BuildingFacadeModal from '@/pages-ADMIN-DIRECTEUR/immeubles/components/BuildingFacadeModal'
import CommercialTrajetsSection from './components/CommercialTrajetsSection'
import CommercialZoneHistorySection from './components/CommercialZoneHistorySection'
import CommercialContratsSection from './components/CommercialContratsSection'
import { useBackNavigation } from '@/hooks/ui/use-back-navigation'
import { useCommercialDetailsLogic } from './useCommercialDetailsLogic'

const AssignedZoneCard = lazy(() => import('@/components/AssignedZoneCard'))

export default function CommercialDetailView() {
  const {
    commercialData,
    loading,
    error,
    dateFilter,
    overview,
    perfStats,
    personalInfo,
    prospection,
    assignedZones,
    buildings,
    buildingModal,
  } = useCommercialDetailsLogic()

  const goBack = useBackNavigation('/commerciaux')
  const [tab, setTab] = useState('batiments')

  if (loading) return <DetailsPageSkeleton />
  if (error) {
    return (
      <div className="p-6 border border-red-200 rounded-lg bg-red-50">
        <p className="text-red-800">Erreur lors du chargement des données : {error}</p>
      </div>
    )
  }
  if (!commercialData) {
    return (
      <div className="p-6 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-gray-800">Commercial non trouvé</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- Vue d'ensemble ---- */}
      {/* Libellé volontairement neutre : on revient d'où l'on vient, ce qui n'est
          pas toujours la liste des commerciaux (fiche manager, Localisation, stats…). */}
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <Card className="border-border/60">
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight truncate">
                  {commercialData.name}
                </h1>
                <Badge variant="outline">Commercial</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Manager : {commercialData.managerName}
                {commercialData.rank?.name ? (
                  <>
                    {' · '}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${commercialData.rank.badgeClasses}`}
                    >
                      🏆 {commercialData.rank.name}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <GameIcon name="stopwatch" size={14} className="shrink-0" />
                <span className="truncate">
                  Dernière activité : {overview.lastActivityLabel}
                  <span className="opacity-70"> · {overview.lastActivityDesc}</span>
                </span>
              </p>
            </div>
            <DateRangeFilter
              className="h-fit"
              startDate={dateFilter.startDate}
              endDate={dateFilter.endDate}
              appliedStartDate={dateFilter.appliedStartDate}
              appliedEndDate={dateFilter.appliedEndDate}
              onChangeStart={dateFilter.setStartDate}
              onChangeEnd={dateFilter.setEndDate}
              onApply={dateFilter.handleApplyFilters}
              onReset={dateFilter.handleResetFilters}
              title="Période"
            />
          </div>

          {/* 4 chiffres clés — signés (terrain) vs validés (back-office) distingués */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              iconName="contract-doc"
              label="Contrats signés"
              value={overview.contratsSignes}
              hint="Déclarés terrain"
            />
            <StatTile
              iconName="stamper"
              label="Contrats validés"
              value={overview.contratsValides}
              hint="Confirmés back-office"
            />
            <StatTile iconName="door" label="Couverture" value={`${overview.couverture}%`} />
            <StatTile iconName="chart" label="Points" value={overview.points} />
          </div>

          {/* Infos de contact (repli) */}
          <details className="group rounded-lg border border-border/60 bg-muted/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-medium">
              Infos de contact
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {personalInfo.map(info => (
                <div key={info.label}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {info.label}
                  </p>
                  <p className="text-sm font-medium break-words">{info.value}</p>
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Coaching (gauche) + stats/onglets (droite), redimensionnable — cf. SplitLayout */}
      <SplitLayout
        storageKey="commercialDetail.splitPct"
        left={
          <CoachingSynthesisSection
            commercialId={commercialData.id}
            subjectName={commercialData.name}
          />
        }
        right={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="batiments">Bâtiments</TabsTrigger>
              <TabsTrigger value="perf">Perf &amp; prospection</TabsTrigger>
              <TabsTrigger value="contrats">Contrats</TabsTrigger>
              <TabsTrigger value="terrain">Terrain</TabsTrigger>
            </TabsList>

            {/* Bâtiments (onglet par défaut) */}
            <TabsContent value="batiments" className="space-y-4">
              <SectionTitle>Bâtiments prospectés</SectionTitle>
              <BuildingsTable rows={buildings.rows} onRowClick={buildings.onRowClick} />
            </TabsContent>

            {/* Perf & prospection */}
            <TabsContent value="perf" className="space-y-8">
              <div>
                <SectionTitle>Performance</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {perfStats.map(stat => (
                    <StatTile
                      key={stat.label}
                      label={stat.label}
                      value={stat.value}
                      hint={stat.hint}
                    />
                  ))}
                </div>
              </div>

              <div>
                <SectionTitle>Prospection</SectionTitle>
                <ProspectionChartsSection
                  charts={prospection.charts}
                  totalDoors={prospection.totalDoors}
                />
              </div>
            </TabsContent>

            {/* Contrats validés (offres WinLeadPlus) */}
            <TabsContent value="contrats" className="space-y-4">
              <SectionTitle>Contrats validés (WinLeadPlus)</SectionTitle>
              <CommercialContratsSection commercialId={commercialData.id} />
            </TabsContent>

            {/* Terrain (zones + GPS) */}
            <TabsContent value="terrain" className="@container space-y-8">
              <div className="grid gap-5 @3xl:grid-cols-2">
                <div>
                  <SectionTitle>Zone active</SectionTitle>
                  {assignedZones.length > 0 ? (
                    <Suspense fallback={<MapSkeleton />}>
                      {assignedZones.map(zone => (
                        <AssignedZoneCard
                          key={zone.id}
                          zone={zone}
                          assignmentDate={zone.assignmentDate || zone.createdAt}
                          immeublesCount={zone.immeublesCount || 0}
                        />
                      ))}
                    </Suspense>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Aucune zone assignée
                    </p>
                  )}
                </div>
                <div>
                  <SectionTitle>Historique des zones</SectionTitle>
                  <CommercialZoneHistorySection commercialId={commercialData.id} />
                </div>
              </div>

              <div>
                <SectionTitle>Trajets GPS</SectionTitle>
                <CommercialTrajetsSection
                  commercialId={commercialData.id}
                  commercialName={commercialData.name}
                />
              </div>
            </TabsContent>
          </Tabs>
        }
      />

      <BuildingFacadeModal
        open={buildingModal.open}
        onOpenChange={buildingModal.onOpenChange}
        facade={buildingModal.facade}
      />
    </div>
  )
}
