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
import { AdvancedDataTable } from '@/components/tableau'
import { useBackNavigation } from '@/hooks/ui/use-back-navigation'
import { useManagerDetailsLogic } from './useManagerDetailsLogic'

const AssignedZoneCard = lazy(() => import('@/components/AssignedZoneCard'))

const PERF_TITLES = ['Contrats signés', 'Rendez-vous pris', 'Argumentés', 'Refus', 'Absents']

export default function ManagerDetailView() {
  const {
    managerData,
    managerLoading,
    error,
    managerZones,
    personalInfo,
    personalStatsCards,
    teamStatsCards,
    additionalSections,
    dateFilter,
    isAdmin,
  } = useManagerDetailsLogic()

  const goBack = useBackNavigation('/managers')
  const [tab, setTab] = useState('batiments')

  if (managerLoading) return <DetailsPageSkeleton />
  if (error) {
    return (
      <div className="p-6 border border-red-200 rounded-lg bg-red-50">
        <p className="text-red-800">Erreur lors du chargement des données : {error}</p>
      </div>
    )
  }
  if (!managerData) {
    return (
      <div className="p-6 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-gray-800">Manager non trouvé</p>
      </div>
    )
  }

  // Sections construites par le hook (réutilisées telles quelles).
  const section = title => (additionalSections || []).find(s => s.title === title)
  const prospSec = section('Statistiques de prospection')
  const batSec = section('Bâtiments prospectés')
  const classSec = section('Classement des commerciaux')
  const gestionSec = section("Gestion de l'équipe")
  const audioSec = section('Enregistrements audio')

  const stat = title => (personalStatsCards || []).find(c => c.title === title)
  const lastActivity = stat('Dernière activité terrain')

  // Couverture globale depuis la section prospection (portes prospectées / capacité déclarée).
  const portes = prospSec?.data?.charts?.find(c => c.props?.portes)?.props?.portes || []
  const totalDoors = prospSec?.data?.totalDoors || 0
  const prospectees = portes.filter(
    p => String(p.statut || '').toUpperCase() !== 'NON_VISITE'
  ).length
  const couverture = totalDoors > 0 ? Math.round((prospectees / totalDoors) * 100) : 0

  const perfStats = PERF_TITLES.map(t => {
    const c = stat(t)
    return { label: t, value: c?.value ?? 0 }
  })

  return (
    <div className="space-y-6">
      {/* ---- Vue d'ensemble ---- */}
      {/* Libellé neutre : on revient d'où l'on vient, pas forcément de la liste
          des managers (page Équipe, Localisation, Statistiques…). */}
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
                <h1 className="text-2xl font-bold tracking-tight truncate">{managerData.name}</h1>
                <Badge variant="outline">Manager</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Directeur : {managerData.directeur}
                {managerData.rank?.name ? (
                  <>
                    {' · '}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${managerData.rank.badgeClasses || ''}`}
                    >
                      🏆 {managerData.rank.name}
                    </span>
                  </>
                ) : null}
              </p>
              {lastActivity && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GameIcon name="stopwatch" size={14} className="shrink-0" />
                  <span className="truncate">
                    Dernière activité : {lastActivity.value}
                    {lastActivity.description ? (
                      <span className="opacity-70"> · {lastActivity.description}</span>
                    ) : null}
                  </span>
                </p>
              )}
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

          {/* 4 chiffres clés */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              iconName="contract-doc"
              label="Contrats signés"
              value={managerData.totalContratsSignes}
              hint="Perso (terrain)"
            />
            <StatTile iconName="door" label="Couverture" value={`${couverture}%`} />
            <StatTile iconName="chart" label="Points" value={managerData.points} />
            <StatTile
              iconName="team"
              label="Équipe"
              value={managerData.equipe_taille}
              hint={managerData.equipe_taille > 1 ? 'commerciaux' : 'commercial'}
            />
          </div>

          {/* Infos de contact (repli) */}
          <details className="group rounded-lg border border-border/60 bg-muted/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-medium">
              Infos de contact
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {(personalInfo || []).map(info => (
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

      {/* Coaching (gauche) + stats/onglets (droite), redimensionnable */}
      <SplitLayout
        storageKey="managerDetail.splitPct"
        left={
          <CoachingSynthesisSection managerId={managerData.id} subjectName={managerData.name} />
        }
        right={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="batiments">Bâtiments</TabsTrigger>
              <TabsTrigger value="perf">Perf &amp; prospection</TabsTrigger>
              <TabsTrigger value="equipe">Équipe</TabsTrigger>
              <TabsTrigger value="terrain">Terrain</TabsTrigger>
              <TabsTrigger value="ecoutes">Écoutes</TabsTrigger>
            </TabsList>

            {/* Bâtiments (défaut) — pas de modal façade côté manager */}
            <TabsContent value="batiments" className="space-y-4">
              <SectionTitle>Bâtiments prospectés</SectionTitle>
              <BuildingsTable rows={batSec?.data?.immeubles || []} />
            </TabsContent>

            {/* Perf & prospection */}
            <TabsContent value="perf" className="space-y-8">
              <div>
                <SectionTitle>Performance</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {perfStats.map(s => (
                    <StatTile key={s.label} label={s.label} value={s.value} />
                  ))}
                </div>
              </div>
              {prospSec && (
                <div>
                  <SectionTitle>Prospection</SectionTitle>
                  <ProspectionChartsSection
                    charts={prospSec.data.charts}
                    totalDoors={prospSec.data.totalDoors}
                  />
                </div>
              )}
            </TabsContent>

            {/* Équipe — KPI équipe (bug corrigé) + classement + gestion */}
            <TabsContent value="equipe" className="space-y-8">
              {teamStatsCards?.length > 0 && (
                <div>
                  <SectionTitle>Statistiques de l'équipe</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {teamStatsCards.map(c => (
                      <StatTile
                        key={c.title}
                        label={c.title}
                        value={c.value}
                        hint={c.description}
                      />
                    ))}
                  </div>
                </div>
              )}
              {classSec && (
                <div>
                  <SectionTitle>Classement des commerciaux</SectionTitle>
                  <AdvancedDataTable {...classSec.data} />
                </div>
              )}
              {isAdmin && gestionSec?.render && (
                <div>
                  <SectionTitle>Gestion de l'équipe</SectionTitle>
                  {gestionSec.render()}
                </div>
              )}
            </TabsContent>

            {/* Terrain — zone active (pas de GPS/historique côté manager) */}
            <TabsContent value="terrain" className="space-y-4">
              <SectionTitle>Zone active</SectionTitle>
              {managerZones.length > 0 ? (
                <Suspense fallback={<MapSkeleton />}>
                  {managerZones.map(zone => (
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
            </TabsContent>

            {/* Écoutes — enregistrements audio du manager */}
            <TabsContent value="ecoutes" className="space-y-4">
              <SectionTitle>Écoutes audio</SectionTitle>
              {audioSec?.render?.()}
            </TabsContent>
          </Tabs>
        }
      />
    </div>
  )
}
