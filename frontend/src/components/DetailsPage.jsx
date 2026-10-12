import React, { lazy, Suspense, useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Mail,
  Phone,
  MapPin,
  Calendar,
  TrendingUp,
  Users,
  Building2,
  DoorOpen,
  FileText,
  KeyRound,
  Loader2,
  MessageCircle,
  Mic,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Star,
  Target,
  UserX,
  X,
} from 'lucide-react'
import { useDetailsSections } from '@/contexts/DetailsSectionsContext'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { MapSkeleton } from '@/components/LoadingSkeletons'
import { StatTile } from '@/components/details/DetailPrimitives'
import { useEntityPermissions } from '@/hooks/metier/permissions/useRoleBasedData'
import PortesProspectionChart from './charts/PortesProspectionChart'
import PortesWeeklyChart from './charts/PortesWeeklyChart'
import PortesStatusChart from './charts/PortesStatusChart'
import PorteHistoriqueTimeline from '@/pages-ADMIN-DIRECTEUR/immeubles/components/PorteHistoriqueTimeline'
import RecordingSegmentPlayer from '@/components/RecordingSegmentPlayer'
import { useRecordingSegmentsByPorte } from '@/hooks/metier/api/portes'
import { formatDateTimeFr, formatDateFr } from '@/lib/format-date'
import { getStatusColor, getStatusLabel } from '@/constants/domain/porte-status'
import {
  formatDuration,
  SpeechScoreBar,
} from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'
import { cn } from '@/lib/utils'

const AssignedZoneCard = lazy(() => import('./AssignedZoneCard'))

/**
 * Les appelants (`statsCards`, `personalInfo`) désignent leur icône par une chaîne.
 * `iconComponent` rend le **composant**, ce que `StatTile` attend ; `getIcon` (plus
 * bas) reste pour les blocs qui rendent l'élément eux-mêmes avec leurs classes.
 */
const ICON_COMPONENTS = {
  award: Award,
  badgeCheck: BadgeCheck,
  building: Building2,
  calendar: Calendar,
  doorOpen: DoorOpen,
  fileText: FileText,
  key: KeyRound,
  keyRound: KeyRound,
  mail: Mail,
  mapPin: MapPin,
  messageCircle: MessageCircle,
  'message-square': MessageCircle,
  phone: Phone,
  shieldCheck: ShieldCheck,
  star: Star,
  target: Target,
  trendingUp: TrendingUp,
  userX: UserX,
  users: Users,
  x: X,
}

const iconComponent = iconName => ICON_COMPONENTS[iconName] || BadgeCheck

function SectionHeader({ title, description }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-primary" />
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

function ProspectionChartsSection({ charts = [], totalDoors }) {
  const portes = charts.find(chart => chart.props?.portes)?.props?.portes || []

  const summary = useMemo(() => {
    const normalizeStatus = status => String(status || '').toUpperCase()
    const portesProspectees = portes.filter(
      porte => normalizeStatus(porte.statut) !== 'NON_VISITE'
    ).length
    // Couverture = prospectées / total de portes PRÉVUES (grille déclarée), jamais / portes créées.
    const totalPortes = totalDoors > 0 ? totalDoors : 0
    const contrats = portes
      .filter(porte => normalizeStatus(porte.statut) === 'CONTRAT_SIGNE')
      .reduce((sum, porte) => sum + (porte.nbContrats || 1), 0)
    const rdv = portes.filter(porte => normalizeStatus(porte.statut) === 'RENDEZ_VOUS_PRIS').length
    const refus = portes.filter(porte => normalizeStatus(porte.statut) === 'REFUS').length
    const argumentes = portes.filter(porte => normalizeStatus(porte.statut) === 'ARGUMENTE').length
    const absents = portes.filter(porte => normalizeStatus(porte.statut) === 'ABSENT').length
    const couverture = totalPortes > 0 ? Math.round((portesProspectees / totalPortes) * 100) : 0
    const opportunites = contrats + rdv + refus + argumentes
    const conversion = opportunites > 0 ? Math.round((contrats / opportunites) * 100) : 0
    const contact = portesProspectees > 0 ? Math.round((opportunites / portesProspectees) * 100) : 0

    return {
      totalPortes,
      portesProspectees,
      contrats,
      rdv,
      refus,
      argumentes,
      absents,
      couverture,
      conversion,
      contact,
      funnel: [
        { label: 'Portes prospectées', value: portesProspectees, percent: couverture },
        { label: 'Contacts qualifiés', value: opportunites, percent: contact },
        {
          label: 'Rendez-vous',
          value: rdv,
          percent: portesProspectees > 0 ? Math.round((rdv / portesProspectees) * 100) : 0,
        },
        {
          label: 'Contrats',
          value: contrats,
          percent: portesProspectees > 0 ? Math.round((contrats / portesProspectees) * 100) : 0,
        },
      ],
    }
  }, [portes, totalDoors])

  const renderChart = (chart, index) => {
    if (chart.type === 'PortesStatusChart') {
      return <PortesStatusChart key={index} {...chart.props} />
    }
    if (chart.type === 'PortesProspectionChart') {
      return <PortesProspectionChart key={index} {...chart.props} />
    }
    if (chart.type === 'PortesWeeklyChart') {
      return <PortesWeeklyChart key={index} {...chart.props} />
    }
    return null
  }

  const statusChart = charts.find(chart => chart.type === 'PortesStatusChart')
  const trendCharts = charts.filter(chart => chart.type !== 'PortesStatusChart')

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Couverture"
          value={`${summary.couverture}%`}
          hint={`${summary.portesProspectees}/${summary.totalPortes} portes prospectées`}
          icon={DoorOpen}
        />
        <StatTile
          label="Contrats"
          value={summary.contrats}
          hint={`${summary.conversion}% de conversion qualifiée`}
          icon={BadgeCheck}
        />
        <StatTile
          label="Rendez-vous"
          value={summary.rdv}
          hint="Opportunités à suivre"
          icon={Calendar}
        />
        <StatTile
          label="Points de friction"
          value={summary.refus + summary.argumentes + summary.absents}
          hint={`${summary.refus} refus · ${summary.absents} absents`}
          icon={UserX}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="border-border/60 bg-card xl:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Funnel terrain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.funnel.map((step, index) => (
              <div key={step.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground">
                    {step.value} · {step.percent}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(step.percent, 100)}%`,
                      opacity: 1 - index * 0.12,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="xl:col-span-2">{statusChart && renderChart(statusChart, 0)}</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">{trendCharts.map(renderChart)}</div>
    </div>
  )
}

function InlineDoorDetails({ door }) {
  const porteId = Number(door.porteId || door.id)
  const { data: segments = [], loading: segmentsLoading } = useRecordingSegmentsByPorte(porteId)
  const normalizedStatus = String(door.status || door.statut || '').toUpperCase()

  // 1 enregistrement par porte : on retient le plus long si plusieurs remontent.
  const primarySegment = useMemo(() => {
    if (!segments.length) return null
    return segments.reduce((longest, seg) =>
      (seg.durationSec || 0) > (longest.durationSec || 0) ? seg : longest
    )
  }, [segments])

  const derniereVisite = formatDateTimeFr(door.visitedAt || door.lastVisit)
  const rdvDateLabel = formatDateFr(door.rdvDate)
  const rdvLabel = rdvDateLabel
    ? door.rdvTime
      ? `${rdvDateLabel} à ${door.rdvTime}`
      : rdvDateLabel
    : null
  const commentaire = door.comment || door.commentaire

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Porte {door.number || door.numero}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {door.etage || (door.floor != null ? `Étage ${door.floor}` : 'Étage non renseigné')}
              {door.address && ` · ${door.address}`}
            </p>
          </div>
          {normalizedStatus && (
            <Badge className={getStatusColor(normalizedStatus)}>
              {getStatusLabel(normalizedStatus)}
            </Badge>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Dernière visite
            </p>
            <p className="mt-1 text-xs font-medium tabular-nums">{derniereVisite || '-'}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">RDV</p>
            <p className="mt-1 text-xs font-medium tabular-nums">{rdvLabel || '-'}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Enregistrement
            </p>
            <p className="mt-1 text-xs font-medium tabular-nums">
              {segmentsLoading
                ? 'Chargement...'
                : primarySegment
                  ? (formatDuration(primarySegment.durationSec) ?? 'Audio dispo')
                  : 'Aucun'}
            </p>
          </div>
        </div>

        {commentaire && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Commentaire</p>
            <p className="mt-1 text-xs text-muted-foreground">{commentaire}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border/60 bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Enregistrement</h3>
            </div>
            {!segmentsLoading && primarySegment?.speechScore != null && (
              <SpeechScoreBar score={primarySegment.speechScore} />
            )}
          </div>

          {segmentsLoading ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Chargement des enregistrements...
            </div>
          ) : segments.length > 0 ? (
            <div className="space-y-2">
              {segments.map(segment => (
                <RecordingSegmentPlayer key={segment.id} segment={segment} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
              Aucun enregistrement lié à cette porte.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-background p-4">
          <PorteHistoriqueTimeline porteId={porteId} porteNumero={door.number || door.numero} />
        </div>
      </div>
    </div>
  )
}

/**
 * Composant de tableau sans Card wrapper pour éviter les doubles cards
 */
function DoorsTableContent({
  data,
  columns,
  customStatusFilter = null,
  searchPlaceholder = 'Rechercher...',
  searchKey = 'number',
  nestedTableColumns = null,
  nestedDataKey = null,
  showFilters = true,
  onRowClick = null,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [floorFilter, setFloorFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const itemsPerPage = 20

  const availableFloors = useMemo(() => {
    const floors = data.map(item => Number(item.floor)).filter(floor => Number.isFinite(floor))
    return Array.from(new Set(floors)).sort((a, b) => a - b)
  }, [data])

  const baseFilteredData = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return data.filter(item => {
      const floorMatch =
        floorFilter === 'all' ||
        (Number.isFinite(Number(item.floor)) && Number(item.floor) === Number(floorFilter))

      if (!floorMatch) return false
      if (!normalizedSearch) return true

      const searchableValues = [item[searchKey], item.number, item.etage, item.comment]
      return searchableValues.some(
        value => value != null && String(value).toLowerCase().includes(normalizedSearch)
      )
    })
  }, [data, floorFilter, searchKey, searchTerm])

  const statusCounts = useMemo(() => {
    return baseFilteredData.reduce((acc, item) => {
      const status = item.status
      if (status) {
        acc.set(status, (acc.get(status) || 0) + 1)
      }
      return acc
    }, new Map())
  }, [baseFilteredData])

  // Filtrage et tri des données
  const filteredAndSortedData = useMemo(() => {
    const filtered = baseFilteredData.filter(
      item => statusFilter === 'all' || item.status === statusFilter
    )

    if (!sortConfig.key) return filtered

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]
      const aIsNull = aValue == null || aValue === ''
      const bIsNull = bValue == null || bValue === ''

      if (aIsNull && bIsNull) return 0
      if (aIsNull) return sortConfig.direction === 'asc' ? 1 : -1
      if (bIsNull) return sortConfig.direction === 'asc' ? -1 : 1

      const aNumber = Number(aValue)
      const bNumber = Number(bValue)
      const isNumeric = Number.isFinite(aNumber) && Number.isFinite(bNumber)

      if (isNumeric) {
        return sortConfig.direction === 'asc' ? aNumber - bNumber : bNumber - aNumber
      }

      const comparison = String(aValue).localeCompare(String(bValue), 'fr', {
        numeric: true,
        sensitivity: 'base',
      })
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [baseFilteredData, sortConfig, statusFilter])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage)
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedData.slice(startIndex, endIndex)
  }, [filteredAndSortedData, currentPage])

  const filtersSignature = `${searchTerm}|${statusFilter}|${floorFilter}`

  // Réinitialise la page quand on change de filtre/recherche
  useEffect(() => {
    if (filtersSignature) {
      setCurrentPage(1)
    }
  }, [filtersSignature])

  const handleSort = key => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const toggleRow = rowId => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      return newSet
    })
  }

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 rounded-lg"
              />
            </div>

            {availableFloors.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="justify-between min-w-[150px] rounded-lg">
                    <span className="inline-flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      {floorFilter === 'all' ? 'Tous les étages' : `Étage ${floorFilter}`}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Filtrer par étage</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFloorFilter('all')}>
                    Tous les étages
                  </DropdownMenuItem>
                  {availableFloors.map(floor => (
                    <DropdownMenuItem key={floor} onClick={() => setFloorFilter(String(floor))}>
                      Étage {floor}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {(searchTerm || statusFilter !== 'all' || floorFilter !== 'all') && (
              <Button
                variant="ghost"
                className="rounded-lg"
                onClick={() => {
                  setSearchTerm('')
                  setStatusFilter('all')
                  setFloorFilter('all')
                }}
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>

          {customStatusFilter && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {customStatusFilter.map(filter => {
                const isActive = statusFilter === filter.value
                const count =
                  filter.value === 'all'
                    ? baseFilteredData.length
                    : statusCounts.get(filter.value) || 0

                return (
                  <Button
                    key={filter.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`h-8 rounded-full border px-3 text-xs font-medium whitespace-nowrap ${
                      isActive
                        ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15'
                        : 'bg-background text-muted-foreground border-border/60 hover:bg-muted/40'
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-foreground/80">
                      {count}
                    </span>
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                {columns.map((column, index) => (
                  <TableHead
                    key={index}
                    className={`${column.className || ''} ${column.sortable ? 'cursor-pointer hover:bg-muted' : ''}`}
                    onClick={() => column.sortable && handleSort(column.sortKey || column.accessor)}
                  >
                    <div className="flex items-center">
                      {column.header}
                      {column.sortable &&
                        sortConfig.key === (column.sortKey || column.accessor) && (
                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                    Aucun résultat trouvé
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map(row => {
                  const rowKey = row.tableId || row.id
                  const porteId = row.porteId || row.id
                  const isExpanded = expandedRows.has(rowKey)

                  // Vérifier si c'est une ligne 'Immeuble' avec des portes imbriquées (via nestedDataKey)
                  // OU fallback sur le comportement par défaut (PorteHistoriqueTimeline)
                  const hasNestedData =
                    nestedDataKey && row[nestedDataKey] && row[nestedDataKey].length > 0
                  const isDoorRow =
                    !hasNestedData && Boolean(row.porteId || row.number || row.numero)
                  // Ligne bâtiment cliquable → ouvre un modal (au lieu d'imbriquer une sous-table)
                  const clickToOpen = Boolean(onRowClick && hasNestedData)

                  return (
                    <React.Fragment key={rowKey}>
                      <TableRow
                        className={cn(
                          'hover:bg-muted/50',
                          (isDoorRow || clickToOpen) && 'cursor-pointer'
                        )}
                        onClick={() => {
                          if (clickToOpen) onRowClick(row)
                          else if (isDoorRow) toggleRow(rowKey)
                        }}
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={event => {
                              event.stopPropagation()
                              if (clickToOpen) onRowClick(row)
                              else toggleRow(rowKey)
                            }}
                            className="h-8 w-8 p-0"
                            aria-label={
                              clickToOpen
                                ? 'Ouvrir le bâtiment'
                                : isExpanded
                                  ? 'Replier la ligne'
                                  : 'Déplier la ligne'
                            }
                          >
                            <ChevronRight
                              className={`h-4 w-4 transition-transform ${!clickToOpen && isExpanded ? 'rotate-90' : ''}`}
                            />
                          </Button>
                        </TableCell>
                        {columns.map((column, colIndex) => (
                          <TableCell key={colIndex} className={column.className}>
                            {column.cell ? column.cell(row) : row[column.accessor]}
                          </TableCell>
                        ))}
                      </TableRow>
                      {!clickToOpen && isExpanded && (
                        <TableRow>
                          <TableCell colSpan={columns.length + 1} className="p-0 bg-muted/20">
                            <div className="p-2 sm:p-4">
                              {hasNestedData ? (
                                <DoorsTableContent
                                  data={row[nestedDataKey]}
                                  columns={nestedTableColumns}
                                  customStatusFilter={[
                                    { value: 'all', label: 'Tous les statuts' },
                                    { value: 'contrat_signe', label: 'Contrats signés' },
                                    { value: 'rendez_vous_pris', label: 'RDV programmés' },
                                    { value: 'absent', label: 'Absents' },
                                    { value: 'argumente', label: 'Argumentés' },
                                    { value: 'refus', label: 'Refus' },
                                    {
                                      value: 'necessite_repassage',
                                      label: 'Repassages nécessaires',
                                    },
                                    { value: 'non_visite', label: 'Non visités' },
                                  ]} // Filtres par défaut pour les portes
                                  searchPlaceholder="Rechercher porte..."
                                  searchKey="number"
                                />
                              ) : isDoorRow ? (
                                <InlineDoorDetails door={row} />
                              ) : (
                                <PorteHistoriqueTimeline
                                  porteId={porteId}
                                  porteNumero={row.number}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {/* Footer avec pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredAndSortedData.length === data.length
            ? `${filteredAndSortedData.length} résultats`
            : `${filteredAndSortedData.length} sur ${data.length} résultats`}
        </div>

        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className={
                    currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
                />
              </PaginationItem>

              {[...Array(totalPages)].map((_, index) => {
                const pageNumber = index + 1
                if (
                  pageNumber === 1 ||
                  pageNumber === totalPages ||
                  (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                ) {
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNumber)}
                        isActive={currentPage === pageNumber}
                        className="cursor-pointer"
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  )
                } else if (pageNumber === currentPage - 2 || pageNumber === currentPage + 2) {
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )
                }
                return null
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className={
                    currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  )
}

/**
 * Composant de page de détails réutilisable
 * @param {Object} props
 * @param {string} props.title - Titre principal de la page
 * @param {string} props.subtitle - Sous-titre ou description
 * @param {Object} props.data - Données de l'entité à afficher
 * @param {Object} props.personalInfo - Section d'informations personnelles
 * @param {Array} props.statsCards - Cartes de statistiques
 * @param {Array} props.additionalSections - Sections supplémentaires personnalisées
 * @param {Array} props.assignedZones - Zones assignées à afficher (optionnel)
 * @param {string} props.status - Status de l'entité (actif, inactif, etc.)
 * @param {ReactNode} props.headerBadge - Badge personnalisé rendu dans le header (prioritaire sur status)
 * @param {string} props.headerAccent - Classes de bordure d'accent pour le header (optionnel)
 * @param {ReactNode} props.statsFilter - Composant de filtre à afficher au-dessus des statistiques (optionnel)
 */
export default function DetailsPage({
  title,
  subtitle,
  data,
  personalInfo = [],
  statsCards = [],
  additionalSections = [],
  assignedZones = null,
  status,
  headerBadge = null,
  headerAccent = '',
  statsFilter = null,
  dense = false,
}) {
  const navigate = useNavigate()
  const zonePermissions = useEntityPermissions('zones')
  const { setSections, focusedSection } = useDetailsSections()

  // Créer un ID unique pour chaque section basé sur son titre
  const createSectionId = title => {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever l es accents
      .replace(/[^a-z0-9]+/g, '-') // Remplacer les caractères spéciaux par des tirets
      .replace(/^-+|-+$/g, '') // Enlever les tirets au début et à la fin
  }

  // Enregistrer les sections dans le contexte quand le composant est monté
  useEffect(() => {
    const sections = []
    // Sections additionnelles positionnées EN HAUT (avant les stats)
    additionalSections
      .filter(section => section.position === 'top')
      .forEach(section => {
        sections.push({ id: createSectionId(section.title), title: section.title })
      })

    // Ajouter la section des informations personnelles
    if (personalInfo.length > 0) {
      sections.push({
        id: 'informations-personnelles',
        title: 'Informations personnelles',
      })
    }

    // Ajouter la section des statistiques
    if (statsCards.length > 0) {
      sections.push({
        id: 'statistiques',
        title: 'Statistiques',
      })
    }

    // Ajouter la section des zones assignées
    if (assignedZones && zonePermissions.canView) {
      sections.push({
        id: 'zones-assignees',
        title: 'Zones assignées',
      })
    }

    // Ajouter les sections additionnelles restantes (en bas)
    additionalSections
      .filter(section => section.position !== 'top')
      .forEach(section => {
        sections.push({
          id: createSectionId(section.title),
          title: section.title,
        })
      })

    setSections(sections)

    // Nettoyer les sections quand on quitte la page
    return () => setSections([])
  }, [
    personalInfo,
    statsCards,
    assignedZones,
    additionalSections,
    zonePermissions.canView,
    setSections,
  ])

  const getStatusBadge = status => {
    const variants = {
      actif: 'default',
      inactif: 'secondary',
      suspendu: 'destructive',
      en_conge: 'outline',
      en_renovation: 'outline',
      en_maintenance: 'outline',
      complet: 'default',
      en_developpement: 'secondary',
      saisonnier: 'outline',
    }

    const labels = {
      actif: 'Actif',
      inactif: 'Inactif',
      suspendu: 'Suspendu',
      en_conge: 'En congé',
      en_renovation: 'En rénovation',
      en_maintenance: 'En maintenance',
      complet: 'Complet',
      en_developpement: 'En développement',
      saisonnier: 'Saisonnier',
    }

    return <Badge variant={variants[status] || 'default'}>{labels[status] || status}</Badge>
  }

  const getIcon = (iconName, iconColor = 'text-primary', className = '') => {
    const Icon = iconComponent(iconName)
    return <Icon className={`h-4 w-4 ${iconColor} ${className}`} />
  }

  // Fonction pour obtenir les classes CSS d'une section focusée
  const getSectionClasses = sectionId => {
    return focusedSection === sectionId
      ? 'rounded-xl ring-2 ring-primary/20 ring-offset-2 ring-offset-background transition-all duration-300'
      : 'transition-all duration-300'
  }

  const renderTrend = trend => {
    if (!trend) return null

    return (
      <div className="mt-4 border-t border-border/60 pt-3">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium ${
            trend.type === 'positive'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-destructive'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          {trend.value}
        </div>
      </div>
    )
  }

  const STAT_CARD_SIZES = { full: 'xl', half: 'lg', default: 'md' }

  /**
   * `trend` est un rendu libre côté appelant (pas un écart numérique) : il passe par
   * `footer` plutôt que par le `delta` de `StatTile`.
   */
  const renderStatCard = (stat, index, variant = 'default') => (
    <StatTile
      key={index}
      size={STAT_CARD_SIZES[variant] || STAT_CARD_SIZES.default}
      interactive
      icon={stat.icon ? iconComponent(stat.icon) : undefined}
      label={stat.title}
      value={stat.value}
      hint={stat.description}
      footer={renderTrend(stat.trend)}
    />
  )

  return (
    <div className="mb-50 space-y-8">
      {/* Header avec bouton retour */}
      <div
        className={cn('rounded-2xl border border-border/60 bg-card p-5 shadow-sm', headerAccent)}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
              {headerBadge ? headerBadge : status && getStatusBadge(status)}
            </div>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      {/* Sections additionnelles EN HAUT (avant les stats) — auto-encadrées */}
      {additionalSections
        .filter(section => section.position === 'top')
        .map((section, index) => (
          <div
            key={`top-${index}`}
            id={createSectionId(section.title)}
            className={getSectionClasses(createSectionId(section.title))}
          >
            {section.render ? section.render(data) : null}
          </div>
        ))}
      {/* Informations personnelles */}
      {personalInfo.length > 0 && (
        <div
          id="informations-personnelles"
          className={getSectionClasses('informations-personnelles')}
        >
          <SectionHeader title="Informations personnelles" description="Détails et coordonnées" />
          {dense ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {personalInfo.map((info, index) => (
                <div
                  key={index}
                  className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border/60 bg-card p-3"
                >
                  {info.icon && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-primary">
                      {getIcon(info.icon, info.iconColor || 'text-primary')}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {info.label}
                    </p>
                    <div className="mt-0.5 truncate text-sm font-semibold leading-5 text-foreground">
                      {info.value || <span className="text-muted-foreground">Non renseigné</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="border-border/60 bg-card">
              <CardContent className="p-0">
                <div className="grid divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0">
                  {personalInfo.map((info, index) => (
                    <div key={index} className="flex min-w-0 items-start gap-3 p-4 sm:p-5">
                      {info.icon && (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/60 text-primary">
                          {getIcon(info.icon, info.iconColor || 'text-primary')}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {info.label}
                        </p>
                        <div className="mt-1.5 text-sm font-semibold leading-6 text-foreground sm:text-base">
                          {info.value || (
                            <span className="text-muted-foreground">Non renseigné</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Statistiques */}
      {statsCards.length > 0 && (
        <div id="statistiques" className={getSectionClasses('statistiques')}>
          <SectionHeader title="Statistiques" description="Indicateurs de performance clés" />
          {statsFilter && <div className="mb-5">{statsFilter}</div>}

          {/* Cards en pleine largeur en premier */}
          {statsCards.filter(stat => stat.fullWidth).length > 0 &&
            (dense ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {statsCards
                  .filter(stat => stat.fullWidth)
                  .map((stat, index) => (
                    <StatTile
                      key={index}
                      size="sm"
                      icon={stat.icon ? iconComponent(stat.icon) : undefined}
                      label={stat.title}
                      value={stat.value}
                      hint={stat.description}
                    />
                  ))}
              </div>
            ) : (
              <div className="mb-5 grid gap-4">
                {statsCards
                  .filter(stat => stat.fullWidth)
                  .map((stat, index) => renderStatCard(stat, index, 'full'))}
              </div>
            ))}

          {/* Cards normales en grille */}
          {dense ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {statsCards
                .filter(stat => !stat.fullWidth && !stat.halfWidth)
                .map((stat, index) => (
                  <StatTile
                    key={index}
                    size="sm"
                    icon={stat.icon ? iconComponent(stat.icon) : undefined}
                    label={stat.title}
                    value={stat.value}
                  />
                ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {statsCards
                .filter(stat => !stat.fullWidth && !stat.halfWidth)
                .map((stat, index) => renderStatCard(stat, index))}
            </div>
          )}

          {/* Cards demi-largeur (taux de conversion) */}
          {statsCards.filter(stat => stat.halfWidth).length > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {statsCards
                .filter(stat => stat.halfWidth)
                .map((stat, index) => renderStatCard(stat, index, 'half'))}
            </div>
          )}
        </div>
      )}

      {/* Section des zones assignées (si applicable et autorisée) */}
      {assignedZones && zonePermissions.canView && (
        <div id="zones-assignees" className={getSectionClasses('zones-assignees')}>
          <SectionHeader
            title="Zones assignées"
            description="Territoires géographiques attribués"
          />
          <div className="space-y-4">
            {assignedZones.length > 0 ? (
              assignedZones.map(zone => (
                <Suspense key={zone.id} fallback={<MapSkeleton />}>
                  <AssignedZoneCard
                    zone={zone}
                    assignmentDate={zone.assignmentDate || zone.createdAt}
                    immeublesCount={zone.immeublesCount || 0}
                  />
                </Suspense>
              ))
            ) : (
              <Card className="border-border/60 bg-card">
                <CardContent>
                  <p className="text-muted-foreground text-center py-8">Aucune zone assignée</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Sections additionnelles personnalisées */}
      {additionalSections
        .filter(section => section.position !== 'top')
        .map((section, index) => (
          <div
            key={index}
            id={createSectionId(section.title)}
            className={getSectionClasses(createSectionId(section.title))}
          >
            <SectionHeader title={section.title} description={section.description} />
            {/* Afficher le filtre personnalisé si présent */}
            {section.customFilter && <div className="mb-5">{section.customFilter}</div>}
            {section.type === 'custom' && section.component === 'ChartsSection' ? (
              <ProspectionChartsSection
                charts={section.data.charts}
                totalDoors={section.data.totalDoors}
              />
            ) : section.type === 'custom' && section.bare && section.render ? (
              // Section auto-encadrée (ex. carte trajet) → pas de Card externe pour
              // éviter une carte dans une carte.
              section.render(data)
            ) : (
              <Card className="border-border/60 bg-card">
                <CardContent>
                  {section.type === 'grid' && (
                    <div className="grid gap-6 md:grid-cols-2">
                      {section.items.map((item, itemIndex) => (
                        <div
                          key={itemIndex}
                          className="rounded-xl border border-border/60 bg-muted/30 p-4"
                        >
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {item.label}
                          </p>
                          <p className="text-base font-semibold mt-1.5">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {section.type === 'list' && (
                    <div className="divide-y">
                      {section.items.map((item, itemIndex) => (
                        <div
                          key={itemIndex}
                          className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                        >
                          <span className="text-sm font-medium">{item.label}</span>
                          <span className="text-sm font-semibold">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {section.type === 'custom' && section.render && section.render(data)}
                  {section.type === 'custom' && section.component === 'DoorsTable' && (
                    <DoorsTableContent
                      data={section.data.doors}
                      columns={section.data.columns}
                      customStatusFilter={section.data.customFilters}
                      searchPlaceholder="Rechercher par numéro de porte..."
                      searchKey="number"
                    />
                  )}
                  {section.type === 'custom' && section.component === 'ImmeublesTable' && (
                    <DoorsTableContent
                      data={section.data.immeubles}
                      columns={section.data.columns}
                      customStatusFilter={section.data.customFilters}
                      searchPlaceholder="Rechercher par adresse..."
                      searchKey="address"
                      nestedTableColumns={section.data.nestedColumns}
                      nestedDataKey="doors"
                      showFilters={section.data.showFilters !== false}
                      onRowClick={section.data.onImmeubleClick}
                    />
                  )}
                  {section.type === 'custom' && section.component === 'FloorDetails' && (
                    <div className="space-y-4">
                      {section.data.map((floor, floorIndex) => (
                        <div
                          key={floorIndex}
                          className="rounded-xl border border-border/60 bg-muted/20 p-4"
                        >
                          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-base font-semibold tracking-tight">
                              Étage {floor.floor}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="bg-background">
                                {floor.doors.filter(d => d.status === 'contrat_signe').length}{' '}
                                signés
                              </Badge>
                              <Badge variant="outline" className="bg-background">
                                {floor.doors.filter(d => d.status === 'rdv_pris').length} RDV
                              </Badge>
                              <Badge variant="outline" className="bg-background">
                                {floor.doors.filter(d => d.status === 'absent').length} absents
                              </Badge>
                              <Badge variant="outline" className="bg-background">
                                {floor.doors.filter(d => d.status === 'argumente').length}{' '}
                                argumentés
                              </Badge>
                              <Badge variant="outline" className="bg-background">
                                {floor.doors.filter(d => d.status === 'refus').length} refus
                              </Badge>
                            </div>
                          </div>

                          <div className="border-t border-border/60 pt-4">
                            <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                              Statut des portes
                            </h4>
                            <div className="grid gap-3">
                              {floor.doors.map((door, doorIndex) => {
                                const getStatusColor = status => {
                                  switch (status) {
                                    case 'contrat_signe':
                                      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    case 'rdv_pris':
                                      return 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                    case 'absent':
                                      return 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                    case 'argumente':
                                      return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    case 'refus':
                                      return 'border-destructive/20 bg-destructive/10 text-destructive'
                                    default:
                                      return 'border-border/60 bg-background text-foreground'
                                  }
                                }

                                const getStatusLabel = status => {
                                  switch (status) {
                                    case 'contrat_signe':
                                      return 'Contrat signé'
                                    case 'rdv_pris':
                                      return 'RDV programmé'
                                    case 'absent':
                                      return 'Absent'
                                    case 'argumente':
                                      return 'Argumenté'
                                    case 'refus':
                                      return 'Refus'
                                    case 'non_visite':
                                      return 'Non visité'
                                    default:
                                      return status
                                  }
                                }

                                return (
                                  <div
                                    key={doorIndex}
                                    className={`rounded-xl border p-3 ${getStatusColor(door.status)}`}
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="font-medium">Porte {door.number}</span>
                                          <span className="rounded-full border border-current/15 bg-background/70 px-2 py-0.5 text-xs">
                                            {getStatusLabel(door.status)}
                                          </span>
                                        </div>

                                        {door.rdvDate && (
                                          <div className="text-sm mt-2">
                                            <span className="font-medium">RDV:</span> {door.rdvDate}{' '}
                                            à {door.rdvTime}
                                          </div>
                                        )}

                                        {door.lastVisit && (
                                          <div className="text-sm mt-1">
                                            <span className="font-medium">Dernière visite:</span>{' '}
                                            {door.lastVisit}
                                          </div>
                                        )}

                                        {door.comment && (
                                          <div className="mt-2 rounded-lg bg-background/70 p-2 text-sm">
                                            <span className="font-medium">Commentaire:</span>{' '}
                                            {door.comment}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ))}
    </div>
  )
}
