import { useParams } from 'react-router-dom'
import {
  useManagerPersonal,
  useDirecteurs,
  useCommercials,
  useUpdateCommercial,
  useCurrentZoneAssignment,
  useTeamLastStatusActivities,
} from '@/services'
import { useRole } from '@/contexts/userole'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { useDateFilter, filterStatisticsByDate } from '@/hooks/utils/filters/useDateFilter'
import {
  usePersonalStats,
  useImmeublesTableData,
  useFilteredPortes,
} from '@/hooks/utils/filters/useStatisticsFilter'
import { buildingDoorCount } from '@/constants/domain/habitat'
import { useEffect, useMemo, useState } from 'react'
import { Mic } from 'lucide-react'
import { calculateRank, calculateRankFromStats, aggregateStats } from '@/utils/business/ranks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BuildingTypeBadge } from '@/components/BuildingTypeBadge'
import DateRangeFilter from '@/components/DateRangeFilter'
import UserRecordingsSection from '@/pages-ADMIN-DIRECTEUR/ecoutes/UserRecordingsSection'
import { AdvancedDataTable } from '@/components/tableau'
import { getStatusLabel, getStatusColor } from '@/constants/domain/porte-status'
import { porteApi } from '@/services/api/portes/porte.service'

const ACTIVITY_STATUS_LABELS = {
  CONTRAT_SIGNE: 'Contrat signé',
  RENDEZ_VOUS_PRIS: 'Rendez-vous pris',
  REFUS: 'Refus',
  ABSENT: 'Absent',
  ARGUMENTE: 'Argumenté',
  NECESSITE_REPASSAGE: 'Repassage nécessaire',
  NON_VISITE: 'Non visité',
}

const formatRelativeActivityDate = dateValue => {
  if (!dateValue) return 'Aucune activité'

  const date = new Date(dateValue)
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return 'Date inconnue'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'À l’instant'
  if (minutes < 60) return `Il y a ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days} j`

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const getActivityDescription = activity => {
  if (!activity) return 'Aucun changement de statut enregistré'

  const statusLabel = ACTIVITY_STATUS_LABELS[activity.statut] || activity.statut
  const address = activity.immeubleAdresse ? ` · ${activity.immeubleAdresse}` : ''
  return `${statusLabel} · Porte ${activity.porteNumero}${address}`
}

export function useManagerDetailsLogic() {
  const { id } = useParams()
  const { isAdmin } = useRole()
  const { showError, showSuccess } = useErrorToast()
  const [assigningCommercial, setAssigningCommercial] = useState(null)
  const [recordingSegments, setRecordingSegments] = useState([])

  useEffect(() => {
    const managerId = parseInt(id)
    if (!Number.isFinite(managerId)) return

    let active = true
    porteApi
      .getRecordingSegmentsByManager(managerId)
      .then(segments => {
        if (active) setRecordingSegments(segments || [])
      })
      .catch(error => {
        console.error('Erreur chargement segments audio du manager:', error)
        if (active) setRecordingSegments([])
      })

    return () => {
      active = false
    }
  }, [id])

  // Hook pour gérer les filtres de date (pour les stats et portes)
  const dateFilter = useDateFilter()
  const { appliedStartDate, appliedEndDate } = dateFilter

  // États pour le filtre des immeubles
  const immeubleDateFilter = useDateFilter()
  const { appliedStartDate: appliedImmeubleStartDate, appliedEndDate: appliedImmeubleEndDate } =
    immeubleDateFilter

  // État pour le type de date à filtrer (création ou modification)
  const [immeubleDateType, setImmeubleDateType] = useState('created')

  // API hooks
  const {
    data: manager,
    loading: managerLoading,
    error,
    refetch,
  } = useManagerPersonal(parseInt(id))
  const { data: directeurs } = useDirecteurs()
  const { data: allCommercials, refetch: refetchCommercials } = useCommercials()
  const { mutate: updateCommercial, loading: updatingCommercial } = useUpdateCommercial()
  const { data: currentManagerZone } = useCurrentZoneAssignment(parseInt(id), 'MANAGER')
  const { data: lastStatusActivities } = useTeamLastStatusActivities()

  // Utiliser le hook pour calculer les stats personnelles du manager
  const { personalStats } = usePersonalStats(manager, appliedStartDate, appliedEndDate)

  // Filtrer les statistiques des commerciaux par date
  const filteredCommercialsStats = useMemo(() => {
    if (!allCommercials) return {}

    const filtered = {}
    allCommercials.forEach(commercial => {
      if (commercial.statistics) {
        filtered[commercial.id] = filterStatisticsByDate(
          commercial.statistics,
          appliedStartDate,
          appliedEndDate
        )
      }
    })
    return filtered
  }, [allCommercials, appliedStartDate, appliedEndDate])

  // Calculer le rang du manager basé sur TOUTES ses stats (non filtrées)
  const memoizedManagerRank = useMemo(() => {
    if (!manager?.statistics) return null

    return calculateRankFromStats(manager.statistics)
  }, [manager?.statistics])

  const lastStatusActivity = useMemo(() => {
    return (lastStatusActivities || []).find(
      activity => activity.userType === 'manager' && activity.userId === parseInt(id)
    )
  }, [id, lastStatusActivities])

  // Transformation des données API vers format UI (avec filtrage)
  const managerData = useMemo(() => {
    if (!manager) return null

    const directeur = directeurs?.find(d => d.id === manager.directeurId)
    const assignedCommercials = allCommercials?.filter(c => c.managerId === manager.id) || []

    // Trouver le meilleur commercial de l'équipe (avec stats filtrées)
    let meilleurCommercial = 'Aucun commercial'
    let meilleurBadge = 'Aucun'

    if (assignedCommercials.length > 0) {
      const commercialAvecRangs = assignedCommercials.map(commercial => {
        // Utiliser les stats filtrées du commercial
        const stats = filteredCommercialsStats[commercial.id] || []
        const {
          contratsSignes,
          rendezVousPris: rendezVous,
          immeublesVisites: immeubles,
        } = aggregateStats(stats)
        const { rank: commercialRank, points: commercialPoints } = calculateRank(
          contratsSignes,
          rendezVous,
          immeubles
        )

        return {
          ...commercial,
          totalPoints: commercialPoints,
          rank: commercialRank,
        }
      })

      const meilleur = commercialAvecRangs.reduce((prev, current) =>
        current.totalPoints > prev.totalPoints ? current : prev
      )

      meilleurCommercial = `${meilleur.prenom} ${meilleur.nom}`
      meilleurBadge = meilleur.rank.name
    }

    return {
      ...manager,
      name: `${manager.prenom} ${manager.nom}`,
      directeur: directeur ? `${directeur.prenom} ${directeur.nom}` : 'Aucun directeur',
      email: manager.email || 'Non renseigné',
      phone: manager.numTelephone || 'Non renseigné',
      equipe_taille: assignedCommercials.length,
      status: 'actif',
      date_promotion: new Date(manager.createdAt).toLocaleDateString('fr-FR'),
      // Stats commerciales du manager (depuis personalStats)
      portesProspectees: personalStats.totalPortesProspectes,
      immeublesProspectes: personalStats.totalImmeublesProspectes,
      totalContratsSignes: personalStats.totalContratsSignes,
      totalImmeublesVisites: personalStats.totalImmeublesVisites,
      totalRendezVousPris: personalStats.totalRendezVousPris,
      totalRefus: personalStats.totalRefus,
      totalAbsents: personalStats.totalAbsents,
      totalArgumentes: personalStats.totalArgumentes,
      // Utiliser le rang permanent (basé sur toutes les stats)
      rank: memoizedManagerRank?.rank,
      points: memoizedManagerRank?.points,
      totalPortesProspectes: personalStats.totalPortesProspectes,
      totalImmeublesProspectes: personalStats.totalImmeublesProspectes,
      lastStatusActivity,
      // Indicateurs de l'équipe
      meilleurCommercial,
      meilleurBadge,
    }
  }, [
    manager,
    directeurs,
    allCommercials,
    personalStats,
    filteredCommercialsStats,
    memoizedManagerRank,
    lastStatusActivity,
  ])

  // Récupérer la zone actuellement assignée à ce manager depuis ZoneEnCours
  const managerZones = useMemo(() => {
    if (!currentManagerZone) return []

    // Utiliser directement les immeubles du manager (qui ont déjà les coordonnées)
    const managerImmeubles = manager?.immeubles || []

    return [
      {
        ...currentManagerZone.zone,
        immeubles: managerImmeubles, // Utiliser les immeubles du manager
        immeublesCount: managerImmeubles.length,
        assignmentDate: currentManagerZone.assignedAt,
      },
    ]
  }, [currentManagerZone, manager?.immeubles])

  // Gestion de l'assignation/désassignation
  const handleAssignCommercial = async commercialId => {
    setAssigningCommercial(commercialId)
    try {
      await updateCommercial({
        id: commercialId,
        managerId: manager.id,
      })
      await refetchCommercials()
      await refetch()
      showSuccess('Commercial assigné avec succès')
    } catch (error) {
      showError(error, 'ManagerDetails.handleAssignCommercial')
    } finally {
      setAssigningCommercial(null)
    }
  }

  const handleUnassignCommercial = async commercialId => {
    setAssigningCommercial(commercialId)
    try {
      await updateCommercial({
        id: commercialId,
        managerId: null,
      })
      await refetchCommercials()
      await refetch()
      showSuccess('Commercial désassigné avec succès')
    } catch (error) {
      showError(error, 'ManagerDetails.handleUnassignCommercial')
    } finally {
      setAssigningCommercial(null)
    }
  }

  // Tableau des commerciaux pour les admins
  const renderCommercialsTable = () => {
    if (!isAdmin || !allCommercials || !manager) return null

    const assignedCommercials = allCommercials
      .filter(c => c.managerId === manager.id)
      .map(c => ({
        id: c.id,
        name: `${c.prenom} ${c.nom}`,
        email: c.email || 'Non renseigné',
        numTel: c.numTel || 'Non renseigné',
        age: `${c.age} ans`,
      }))

    const unassignedCommercials = allCommercials
      .filter(c => !c.managerId)
      .map(c => ({
        id: c.id,
        name: `${c.prenom} ${c.nom}`,
        email: c.email || 'Non renseigné',
        numTel: c.numTel || 'Non renseigné',
        age: `${c.age} ans`,
        status: 'Non assigné',
      }))

    const commonColumns = [
      { header: 'Nom', accessor: 'name', sortable: true, className: 'font-medium' },
      { header: 'Email', accessor: 'email', sortable: true },
      { header: 'Téléphone', accessor: 'numTel' },
      { header: 'Age', accessor: 'age' },
    ]

    const assignedColumns = [
      ...commonColumns,
      {
        header: 'Action',
        accessor: 'action',
        sortable: false,
        className: 'text-center',
        cell: row => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUnassignCommercial(row.id)}
            disabled={assigningCommercial === row.id || updatingCommercial}
          >
            {assigningCommercial === row.id ? 'Retrait...' : 'Retirer'}
          </Button>
        ),
      },
    ]

    const unassignedColumns = [
      ...commonColumns,
      { header: 'Statut', accessor: 'status', className: 'hidden md:table-cell' },
      {
        header: 'Action',
        accessor: 'action',
        sortable: false,
        className: 'text-center',
        cell: row => (
          <Button
            variant="default"
            size="sm"
            onClick={() => handleAssignCommercial(row.id)}
            disabled={assigningCommercial === row.id || updatingCommercial}
          >
            {assigningCommercial === row.id ? 'Assignation...' : 'Assigner'}
          </Button>
        ),
      },
    ]

    return (
      <div className="space-y-6">
        <AdvancedDataTable
          showStatusColumn={false}
          title={`Commerciaux assignés (${assignedCommercials.length})`}
          data={assignedCommercials}
          columns={assignedColumns}
          searchKey="name"
          detailsPath="/commerciaux"
        />

        {unassignedCommercials.length > 0 && (
          <AdvancedDataTable
            showStatusColumn={false}
            title={`Commerciaux disponibles (${unassignedCommercials.length})`}
            data={unassignedCommercials}
            columns={unassignedColumns}
            searchKey="name"
            detailsPath="/commerciaux"
          />
        )}
      </div>
    )
  }

  // Calculer les stats par commercial de l'équipe
  const commercialStats = useMemo(() => {
    if (!allCommercials || !manager) return []

    const assignedCommercials = allCommercials.filter(c => c.managerId === manager.id)

    return assignedCommercials
      .map(commercial => {
        // Utiliser les stats filtrées du commercial
        const stats = filteredCommercialsStats[commercial.id] || []
        const {
          contratsSignes,
          rendezVousPris: rendezVous,
          immeublesVisites: immeubles,
          refus,
        } = aggregateStats(stats)
        const { rank: commercialRank, points: commercialPoints } = calculateRank(
          contratsSignes,
          rendezVous,
          immeubles
        )

        return {
          id: commercial.id,
          nom: `${commercial.prenom} ${commercial.nom}`,
          contratsSignes,
          rendezVous,
          immeubles,
          refus,
          rank: commercialRank,
          points: commercialPoints,
        }
      })
      .sort((a, b) => b.points - a.points) // Trier par points décroissants
  }, [allCommercials, manager, filteredCommercialsStats])

  // Calculer les totaux de l'équipe
  const teamTotals = useMemo(() => {
    const totalContrats = commercialStats.reduce((sum, c) => sum + c.contratsSignes, 0)
    const totalRDV = commercialStats.reduce((sum, c) => sum + c.rendezVous, 0)
    const totalImmeubles = commercialStats.reduce((sum, c) => sum + c.immeubles, 0)
    const totalRefus = commercialStats.reduce((sum, c) => sum + c.refus, 0)

    return {
      totalContrats,
      totalRDV,
      totalImmeubles,
      totalRefus,
    }
  }, [commercialStats])

  // Données des immeubles
  const allImmeublesTableData = useImmeublesTableData(
    manager?.immeubles,
    appliedStartDate,
    appliedEndDate
  )

  const immeublesTableData = useMemo(() => {
    if (!allImmeublesTableData) return []
    if (!appliedImmeubleStartDate && !appliedImmeubleEndDate) return allImmeublesTableData

    return allImmeublesTableData.filter(immeuble => {
      const dateToCompare =
        immeubleDateType === 'created'
          ? new Date(immeuble.createdAt)
          : new Date(immeuble.visitedAt || immeuble.createdAt)

      if (appliedImmeubleStartDate) {
        const startDateObj = new Date(appliedImmeubleStartDate)
        startDateObj.setHours(0, 0, 0, 0)
        if (dateToCompare < startDateObj) return false
      }

      if (appliedImmeubleEndDate) {
        const endDateObj = new Date(appliedImmeubleEndDate)
        endDateObj.setHours(23, 59, 59, 999)
        if (dateToCompare > endDateObj) return false
      }

      return true
    })
  }, [allImmeublesTableData, appliedImmeubleStartDate, appliedImmeubleEndDate, immeubleDateType])

  // Données des portes
  const allPortes = useFilteredPortes(manager?.immeubles, appliedStartDate, appliedEndDate)
  // Capacité déclarée (grille) = dénominateur de la couverture (Option A).
  const totalDoorsGrid = (manager?.immeubles || []).reduce(
    (sum, immeuble) => sum + buildingDoorCount(immeuble),
    0
  )

  const porteSegmentCounts = useMemo(() => {
    const counts = new Map()
    recordingSegments.forEach(segment => {
      if (!segment.porteId) return
      counts.set(segment.porteId, (counts.get(segment.porteId) || 0) + 1)
    })
    return counts
  }, [recordingSegments])

  // Construct props for view
  const personalInfo = managerData
    ? [
        {
          label: 'Email :',
          value: managerData.email,
          icon: 'mail',
        },
        {
          label: 'Téléphone :',
          value: managerData.phone,
          icon: 'phone',
        },
        {
          label: 'Directeur :',
          value: managerData.directeur,
          icon: 'users',
        },
        {
          label: 'Rang :',
          value: (
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${managerData.rank.bgColor} ${managerData.rank.textColor} ${managerData.rank.borderColor} border-text-primary font-semibold`}
            >
              <span className="text-lg">🏆</span>
              {managerData.rank.name}
              <span className="text-xs opacity-75">({managerData.points} pts)</span>
            </span>
          ),
          icon: 'award',
        },
        {
          label: 'Date de création de compte:',
          value: managerData.date_promotion,
          icon: 'calendar',
        },
      ]
    : []

  const personalStatsCards = managerData
    ? [
        {
          title: 'Points totaux',
          value: managerData.points,
          description: 'Score personnel',
          icon: 'trendingUp',
          fullWidth: true,
        },
        {
          title: 'Dernière activité terrain',
          value: formatRelativeActivityDate(managerData.lastStatusActivity?.changedAt),
          description: getActivityDescription(managerData.lastStatusActivity),
          icon: 'shieldCheck',
          fullWidth: true,
        },
        {
          title: 'Contrats signés',
          value: managerData.totalContratsSignes,
          description: 'Total des contrats signés',
          icon: 'fileText',
        },
        {
          title: 'Rendez-vous pris',
          value: managerData.totalRendezVousPris,
          description: 'Total des rendez-vous',
          icon: 'calendar',
        },
        {
          title: 'Bâtiments visités',
          value: managerData.totalImmeublesVisites,
          description: 'Total des bâtiments visités',
          icon: 'building',
        },
        {
          title: 'Refus',
          value: managerData.totalRefus,
          description: 'Total des refus',
          icon: 'x',
        },
        {
          title: 'Absents',
          value: managerData.totalAbsents,
          description: "Portes où personne n'était présent",
          icon: 'userX',
        },
        {
          title: 'Argumentés',
          value: managerData.totalArgumentes,
          description: 'Refus après argumentation',
          icon: 'messageCircle',
        },
        {
          title: 'Portes prospectées',
          value: managerData.totalPortesProspectes,
          description: 'Total des portes prospectées',
          icon: 'fileText',
        },
        {
          title: 'Bâtiments prospectés',
          value: managerData.totalImmeublesProspectes,
          description: 'Total des bâtiments prospectés',
          icon: 'building',
        },
      ]
    : []

  const teamStatsCards = managerData
    ? [
        {
          title: 'Meilleur commercial',
          value: managerData.meilleurCommercial,
          description: `Badge: ${managerData.meilleurBadge}`,
          icon: 'award',
        },
        {
          title: "Taille de l'équipe",
          value: managerData.equipe_taille,
          description: 'Commerciaux assignés',
          icon: 'users',
        },
        {
          title: "Contrats signés par l'équipe",
          value: teamTotals.totalContrats,
          description: `Total de ${commercialStats.length} commercial${commercialStats.length > 1 ? 'aux' : ''}`,
          icon: 'fileText',
        },
        {
          title: "Rendez-vous pris par l'équipe",
          value: teamTotals.totalRDV,
          description: `Total de ${commercialStats.length} commercial${commercialStats.length > 1 ? 'aux' : ''}`,
          icon: 'calendar',
        },
        {
          title: "Bâtiments visités par l'équipe",
          value: teamTotals.totalImmeubles,
          description: `Total de ${commercialStats.length} commercial${commercialStats.length > 1 ? 'aux' : ''}`,
          icon: 'building',
        },
        {
          title: "Refus par l'équipe",
          value: teamTotals.totalRefus,
          description: `Total de ${commercialStats.length} commercial${commercialStats.length > 1 ? 'aux' : ''}`,
          icon: 'x',
        },
      ]
    : []

  // Table columns definition (moved from component to avoid clutter, though simplified)
  // ... (Using same column defs as in ManagerDetails.jsx but exported or defined here)
  const commercialStatsColumns = [
    { header: 'Commercial', accessor: 'nom', sortable: true, className: 'font-medium' },
    {
      header: 'Contrats signés',
      accessor: 'contratsSignes',
      sortable: true,
      className: 'text-center',
      cell: row => <Badge className="bg-green-100 text-green-800">{row.contratsSignes || 0}</Badge>,
    },
    {
      header: 'RDV pris',
      accessor: 'rendezVous',
      sortable: true,
      className: 'text-center',
      cell: row => <Badge className="bg-blue-100 text-blue-800">{row.rendezVous || 0}</Badge>,
    },
    {
      header: 'Bâtiments visités',
      accessor: 'immeubles',
      sortable: true,
      className: 'text-center',
      cell: row => <Badge className="bg-purple-100 text-purple-800">{row.immeubles || 0}</Badge>,
    },
    {
      header: 'Refus',
      accessor: 'refus',
      sortable: true,
      className: 'text-center',
      cell: row => <Badge className="bg-red-100 text-red-800">{row.refus || 0}</Badge>,
    },
    {
      header: 'Rang',
      accessor: 'rank',
      sortable: false,
      className: 'text-center',
      cell: row => (
        <Badge
          className={`${row.rank.bgColor} ${row.rank.textColor} ${row.rank.borderColor} border`}
        >
          {row.rank.name}
        </Badge>
      ),
    },
    {
      header: 'Points',
      accessor: 'points',
      sortable: true,
      className: 'text-center font-semibold',
      cell: row => `${row.points} pts`,
    },
  ]

  const doorsColumns = [
    { header: 'Porte', accessor: 'number', sortable: true, className: 'font-medium' },
    { header: 'Adresse', accessor: 'address', sortable: true, className: 'text-sm' },
    { header: 'Étage', accessor: 'etage', sortable: true, className: 'text-sm' },
    {
      header: 'Statut',
      accessor: 'status',
      sortable: true,
      cell: row => (
        <Badge className={getStatusColor(row.status?.toUpperCase())}>
          {getStatusLabel(row.status?.toUpperCase())}
        </Badge>
      ),
    },
    {
      header: 'RDV',
      accessor: 'rdvDate',
      sortable: true,
      cell: row =>
        row.rdvDate ? (
          <div className="text-sm">
            <div>{row.rdvDate}</div>
            <div className="text-muted-foreground">{row.rdvTime}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      header: 'Dernière visite',
      accessor: 'lastVisit',
      sortable: true,
      cell: row => row.visitedAt || <span className="text-muted-foreground">-</span>,
    },
    {
      header: 'Audio',
      accessor: 'audio',
      sortable: false,
      className: 'text-center',
      cell: row => {
        const count = porteSegmentCounts.get(row.porteId) || 0
        if (!count || !row.immeubleId) return <span className="text-muted-foreground">-</span>

        return (
          <span
            className="inline-flex items-center justify-center gap-1 text-primary"
            title={`${count} audio${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}. Clique la ligne pour ouvrir les détails.`}
          >
            <Mic className="h-4 w-4" />
            <span className="text-sm font-medium">{count}</span>
          </span>
        )
      },
    },
  ]

  const immeublesColumns = [
    { header: 'Adresse', accessor: 'address', sortable: true, className: 'font-medium' },
    {
      header: 'Type',
      accessor: 'type',
      sortable: true,
      className: 'hidden md:table-cell',
      cell: row => <BuildingTypeBadge type={row.type} className="text-[10px]" />,
    },
    {
      header: 'Étages',
      accessor: 'floors',
      className: 'hidden md:table-cell text-center',
      cell: row => `${row.floors} étages`,
    },
    {
      header: 'Total Portes',
      accessor: 'total_doors',
      className: 'hidden lg:table-cell text-center',
    },
    {
      header: 'Couverture',
      accessor: 'couverture',
      sortable: true,
      className: 'hidden lg:table-cell text-center',
      cell: row => (
        <Badge
          className={
            row.couverture >= 80
              ? 'bg-green-100 text-green-800'
              : row.couverture >= 50
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }
        >
          {row.couverture || 0}%
        </Badge>
      ),
    },
    {
      header: 'Contrats signés',
      accessor: 'contrats_signes',
      sortable: true,
      className: 'text-center',
      cell: row => (
        <Badge className="bg-green-100 text-green-800">{row.contrats_signes || 0}</Badge>
      ),
    },
    {
      header: 'RDV pris',
      accessor: 'rdv_pris',
      sortable: true,
      className: 'hidden xl:table-cell text-center',
      cell: row => <Badge className="bg-blue-100 text-blue-800">{row.rdv_pris || 0}</Badge>,
    },
    {
      header: 'Refus',
      accessor: 'refus',
      sortable: true,
      className: 'hidden xl:table-cell text-center',
      cell: row => <Badge className="bg-red-100 text-red-800">{row.refus || 0}</Badge>,
    },
    {
      header: 'Absents',
      accessor: 'absent',
      sortable: true,
      className: 'hidden xl:table-cell text-center',
      cell: row => <Badge className="bg-blue-100 text-blue-800">{row.absent || 0}</Badge>,
    },
    {
      header: 'Argumentés',
      accessor: 'argumente',
      sortable: true,
      className: 'hidden xl:table-cell text-center',
      cell: row => <Badge className="bg-orange-100 text-orange-800">{row.argumente || 0}</Badge>,
    },
  ]

  // Prepare Table Data (Portes)
  const doorsData = useMemo(() => {
    if (!allPortes) return []
    return allPortes.map(porte => {
      const immeuble = manager?.immeubles?.find(i => i.id === porte.immeubleId)
      return {
        ...porte,
        id: porte.id,
        porteId: porte.id,
        immeubleId: porte.immeubleId,
        tableId: `door-${porte.id}`,
        number: porte.numero,
        address: immeuble ? `${immeuble.adresse}` : 'Non spécifié',
        etage: `Étage ${porte.etage}`,
        status: porte.statut.toLowerCase(),
        rdvDate: porte.rdvDate
          ? new Date(porte.rdvDate).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : null,
        rdvTime: porte.rdvTime || null,
        lastVisit: porte.updatedAt ? new Date(porte.updatedAt).toLocaleDateString() : null,
      }
    })
  }, [allPortes, manager?.immeubles])

  const additionalSections = [
    {
      title: 'Classement des commerciaux',
      description: "Performances détaillées de l'équipe sur la période",
      type: 'custom',
      component: 'AdvancedDataTable',
      data: {
        data: commercialStats,
        columns: commercialStatsColumns,
        searchKey: 'nom',
        title: 'Classement',
        showStatusColumn: false,
      },
    },
    {
      title: "Gestion de l'équipe",
      description: 'Affectation des commerciaux au manager',
      type: 'custom',
      component: 'CustomRender',
      render: renderCommercialsTable,
    },
    {
      title: 'Statistiques de prospection',
      description: "Analyse de l'activité de prospection",
      type: 'custom',
      component: 'ChartsSection',
      data: {
        totalDoors: totalDoorsGrid,
        charts: [
          {
            type: 'PortesStatusChart',
            props: {
              portes: allPortes || [],
              title: 'Répartition des statuts',
              description: 'État actuel de toutes les portes',
              showNonVisited: true,
            },
          },
          {
            type: 'PortesProspectionChart',
            props: {
              portes: allPortes || [],
              title: 'Portes prospectées par jour',
              description: 'Activité quotidienne des 7 derniers jours',
              daysToShow: 7,
            },
          },
          {
            type: 'PortesWeeklyChart',
            props: {
              portes: allPortes || [],
              title: 'Évolution hebdomadaire',
              description: 'Tendance sur les 4 dernières semaines',
              weeksToShow: 4,
            },
          },
        ],
      },
    },
    {
      title: 'Bâtiments prospectés',
      description: 'Liste des bâtiments prospectés par ce manager',
      type: 'custom',
      component: 'ImmeublesTable',
      data: {
        immeubles: immeublesTableData,
        columns: immeublesColumns,
        nestedColumns: doorsColumns,
        showFilters: false,
        doorsData: doorsData,
      },
      customFilter: (
        <DateRangeFilter
          className="h-fit"
          startDate={immeubleDateFilter.startDate}
          endDate={immeubleDateFilter.endDate}
          appliedStartDate={appliedImmeubleStartDate}
          appliedEndDate={appliedImmeubleEndDate}
          onChangeStart={immeubleDateFilter.setStartDate}
          onChangeEnd={immeubleDateFilter.setEndDate}
          onApply={immeubleDateFilter.handleApplyFilters}
          onReset={immeubleDateFilter.handleResetFilters}
          title="Filtrer les bâtiments"
          showDateTypeSelector={true}
          dateType={immeubleDateType}
          onDateTypeChange={setImmeubleDateType}
        />
      ),
    },
    {
      title: 'Enregistrements audio',
      description: 'Ecoute et telechargement des enregistrements de ce manager',
      type: 'custom',
      render: () => (
        <UserRecordingsSection
          userId={managerData?.id}
          userType="manager"
          userName={managerData?.name}
        />
      ),
    },
  ]

  return {
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
  }
}
