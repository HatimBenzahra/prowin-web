import { AdvancedDataTable } from '@/components/tableau'
import { TableSkeleton } from '@/components/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LayoutList,
  LayoutGrid,
  Building,
  FileText,
  Percent,
  Calendar,
  User,
  CalendarCheck,
  EyeOff,
  MapPin,
  BadgeCheck,
  ArrowDownWideNarrow,
} from 'lucide-react'
import { USER_STATUS_CONFIG } from '@/constants/domain/user-status'
import ExpandableSearch from '@/components/ExpandableSearch'
import { useImmeublesLogic, AUTONOMES_KEY } from './useImmeublesLogic'
import { CARD_SORT_OPTIONS } from './immeubles-display'
import ImmeublesCardGrid from './components/ImmeublesCardGrid'

export default function Immeubles() {
  const {
    viewMode,
    setViewMode,
    immeublesLoading,
    description,
    tableData,
    immeublesColumns,
    permissions,
    handleDeleteImmeuble,
    stats,
    filterCommercial,
    setFilterCommercial,
    filterQuartier,
    setFilterQuartier,
    cardsGroupedByDate,
    filterOwnerStatus,
    setFilterOwnerStatus,
    cardSearch,
    setCardSearch,
    cardSort,
    setCardSort,
    dateFilterMode,
    setDateFilterMode,
    createdDate,
    setCreatedDate,
    commercialsList,
    quartiersList,
  } = useImmeublesLogic()

  if (immeublesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Bâtiments</h1>
          <p className="text-muted-foreground text-base">
            Gestion du patrimoine immobilier et suivi des propriétés
          </p>
        </div>
        <TableSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/20 dark:hover:border-primary/20 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Bâtiments
            </CardTitle>
            <div className="p-2 bg-blue-500/10 rounded-full">
              <Building className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {stats.totalImmeubles}
            </div>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              {[
                stats.typeBreakdown.IMMEUBLE > 0 && `${stats.typeBreakdown.IMMEUBLE} immeubles`,
                stats.typeBreakdown.MAISON > 0 && `${stats.typeBreakdown.MAISON} maisons`,
                stats.typeBreakdown.PAVILLON > 0 && `${stats.typeBreakdown.PAVILLON} pavillons`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/20 dark:hover:border-primary/20 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contrats Signés
            </CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-full">
              <FileText className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {stats.totalContrats}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total cumulé des signatures</p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/20 dark:hover:border-primary/20 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Couverture Moy.
            </CardTitle>
            <div className="p-2 bg-violet-500/10 rounded-full">
              <Percent className="h-4 w-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {stats.avgCouverture}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Portes prospectées</p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/20 dark:hover:border-primary/20 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              RDV Programmés
            </CardTitle>
            <div className="p-2 bg-blue-500/10 rounded-full">
              <CalendarCheck className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {stats.totalRdv}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rendez-vous à venir</p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-300 hover:shadow-lg hover:border-primary/20 dark:hover:border-primary/20 hover:-translate-y-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Non Visités</CardTitle>
            <div className="p-2 bg-gray-500/10 rounded-full">
              <EyeOff className="h-4 w-4 text-gray-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {stats.totalNonVisites}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Portes non prospectées</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 lg:flex-1">
          {viewMode === 'cards' && (
            <ExpandableSearch
              value={cardSearch}
              onChange={setCardSearch}
              placeholder="Rechercher une adresse…"
            />
          )}

          <Select value={dateFilterMode} onValueChange={setDateFilterMode}>
            <SelectTrigger className="w-auto">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Date / tri" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt_desc">Modifiés récemment</SelectItem>
              <SelectItem value="updatedAt_asc">Modifiés anciennement</SelectItem>
              <SelectItem value="createdAt_desc">Créés récemment</SelectItem>
              <SelectItem value="createdAt_asc">Créés anciennement</SelectItem>
              <SelectItem value="created_yesterday">Créés hier</SelectItem>
              <SelectItem value="created_this_week">Créés cette semaine</SelectItem>
              <SelectItem value="created_specific_date">Créés à une date</SelectItem>
            </SelectContent>
          </Select>

          {dateFilterMode === 'created_specific_date' && (
            <Input
              type="date"
              value={createdDate}
              onChange={event => setCreatedDate(event.target.value)}
              className="w-[170px] border-2 border-primary"
            />
          )}

          <Select value={filterCommercial} onValueChange={setFilterCommercial}>
            <SelectTrigger className="w-auto">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Commercial..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              {commercialsList?.map(commercial => (
                <SelectItem key={commercial.id} value={String(commercial.id)}>
                  {commercial.prenom} {commercial.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterQuartier} onValueChange={setFilterQuartier}>
            <SelectTrigger className="w-auto">
              <MapPin className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Quartier..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les quartiers</SelectItem>
              {quartiersList?.map(quartier => (
                <SelectItem key={quartier.id} value={String(quartier.id)}>
                  {quartier.nom}
                </SelectItem>
              ))}
              <SelectItem value={AUTONOMES_KEY}>Autonomes</SelectItem>
            </SelectContent>
          </Select>

          {/* Le filtre de statut du propriétaire permet aussi de consulter les
              bâtiments des utilisateurs test et les comptes terminés. */}
          <Select value={filterOwnerStatus} onValueChange={setFilterOwnerStatus}>
            <SelectTrigger className="w-auto">
              <BadgeCheck className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Statut..." />
            </SelectTrigger>
            <SelectContent>
              {USER_STATUS_CONFIG.map(status => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
              <SelectItem value="all">Tous les statuts</SelectItem>
            </SelectContent>
          </Select>

          {/* Le tri ferme la liste : c'est le seul contrôle qui apparaît et disparaît
              selon la vue, donc rien ne se déplace quand il change d'état. */}
          {viewMode === 'cards' && (
            <Select value={cardSort} onValueChange={setCardSort}>
              <SelectTrigger className="w-auto">
                <ArrowDownWideNarrow className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Trier..." />
              </SelectTrigger>
              <SelectContent>
                {CARD_SORT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2 lg:shrink-0">
          {/* Contrôle segmenté : un seul conteneur bordé pour deux vues exclusives,
              au lieu de bordures concurrentes. */}
          <div className="inline-flex items-center rounded-md border border-input p-0.5">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="h-7 gap-1.5"
            >
              <LayoutGrid className="h-4 w-4" />
              Grille
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-7 gap-1.5"
            >
              <LayoutList className="h-4 w-4" />
              Liste
            </Button>
          </div>
        </div>
      </div>

      {/* La vue Grille est toujours groupée par quartier, la vue Liste toujours à
          plat : un tableau par quartier réinstancierait une recherche et une
          pagination à chaque section. */}
      {viewMode === 'cards' ? (
        <ImmeublesCardGrid
          groups={cardsGroupedByDate}
          canDelete={permissions.canDelete}
          onDelete={handleDeleteImmeuble}
        />
      ) : (
        <AdvancedDataTable
          showStatusColumn={false}
          title="Liste des bâtiments"
          description={description}
          data={tableData}
          columns={immeublesColumns}
          searchKey="address"
          detailsPath="/immeubles"
          onDelete={permissions.canDelete ? handleDeleteImmeuble : undefined}
        />
      )}
    </div>
  )
}
