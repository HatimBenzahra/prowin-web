import { useParams } from 'react-router-dom'
import {
  useCommercialFull,
  useManagers,
  useCurrentZoneAssignment,
  useTeamLastStatusActivities,
} from '@/services'
import { useEffect, useMemo, useState } from 'react'
import { aggregateStats } from '@/utils/business/ranks'
import { useCommercialRankings, useContratsByCommercial } from '@/hooks/metier/api/gamification'
import { pickMonthlySnapshot, toRankInfo } from '@/lib/rank-wps'
import { buildingDoorCount } from '@/constants/domain/habitat'
import { porteApi } from '@/services/api/portes/porte.service'
import { buildFacadeFloors } from '@/pages-ADMIN-DIRECTEUR/immeubles/facade-data'
import { useDateFilter } from '@/hooks/utils/filters/useDateFilter'
import {
  usePersonalStats,
  useImmeublesTableData,
  useFilteredPortes,
} from '@/hooks/utils/filters/useStatisticsFilter'

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

export function useCommercialDetailsLogic() {
  const { id } = useParams()
  const { data: commercial, loading, error } = useCommercialFull(parseInt(id))
  const { data: managers } = useManagers()
  const { data: currentZone } = useCurrentZoneAssignment(parseInt(id), 'COMMERCIAL')
  const { data: lastStatusActivities } = useTeamLastStatusActivities()

  // Filtre de période UNIQUE (stats + prospection + bâtiments).
  const dateFilter = useDateFilter()
  const { appliedStartDate, appliedEndDate } = dateFilter

  const [recordingSegments, setRecordingSegments] = useState([])

  useEffect(() => {
    const commercialId = parseInt(id)
    if (!Number.isFinite(commercialId)) return

    let active = true
    porteApi
      .getRecordingSegmentsByCommercial(commercialId)
      .then(segments => {
        if (active) setRecordingSegments(segments || [])
      })
      .catch(error => {
        console.error('Erreur chargement segments audio du commercial:', error)
        if (active) setRecordingSegments([])
      })

    return () => {
      active = false
    }
  }, [id])

  const { personalStats } = usePersonalStats(commercial, appliedStartDate, appliedEndDate)

  // Stats globales backend (source de vérité quand aucun filtre de date).
  const backendStats = useMemo(() => {
    if (!commercial?.statistics) return null

    const { contratsSignes, immeublesVisites, rendezVousPris, refus } = aggregateStats(
      commercial.statistics
    )
    return {
      totalContratsSignes: contratsSignes,
      totalImmeublesVisites: immeublesVisites,
      totalRendezVousPris: rendezVousPris,
      totalRefus: refus,
      totalAbsents: commercial.statistics.reduce((sum, stat) => sum + (stat.absents || 0), 0),
      totalArgumentes: commercial.statistics.reduce((sum, stat) => sum + (stat.argumentes || 0), 0),
      totalPortesProspectes: commercial.statistics.reduce(
        (sum, stat) => sum + (stat.nbPortesProspectes || 0),
        0
      ),
      totalImmeublesProspectes: commercial.statistics.reduce(
        (sum, stat) => sum + (stat.nbImmeublesProspectes || 0),
        0
      ),
    }
  }, [commercial?.statistics])

  // Rang = classement mensuel WinLeadPlus (aligné mobile). Repli Bronze/0 si non classé.
  const { data: rankings } = useCommercialRankings(parseInt(id))
  const rankInfo = useMemo(() => toRankInfo(pickMonthlySnapshot(rankings)), [rankings])

  // Contrats VALIDÉS = confirmés back-office (WinLeadPlus `ContratValide`), à distinguer
  // des contrats SIGNÉS déclarés sur le terrain (stats ProWin). On compte par période
  // (date de validation) pour rester cohérent avec le filtre unique.
  const { data: contratsValidesData } = useContratsByCommercial(parseInt(id))
  const contratsValidesCount = useMemo(() => {
    const list = contratsValidesData || []
    if (!appliedStartDate && !appliedEndDate) return list.length
    const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : null
    const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : null
    return list.filter(contrat => {
      const raw = contrat.dateValidation || contrat.dateSignature
      if (!raw) return false
      const t = new Date(raw).getTime()
      if (start != null && t < start) return false
      if (end != null && t > end) return false
      return true
    }).length
  }, [contratsValidesData, appliedStartDate, appliedEndDate])

  const lastStatusActivity = useMemo(() => {
    return (lastStatusActivities || []).find(
      activity => activity.userType === 'commercial' && activity.userId === parseInt(id)
    )
  }, [id, lastStatusActivities])

  const commercialData = useMemo(() => {
    if (!commercial) return null

    const manager = managers?.find(m => m.id === commercial.managerId)
    const managerName = manager ? `${manager.prenom} ${manager.nom}` : 'Aucun manager assigné'

    const hasDateFilter = appliedStartDate || appliedEndDate
    const statsSource = !hasDateFilter && backendStats ? backendStats : personalStats

    return {
      ...commercial,
      name: `${commercial.prenom} ${commercial.nom}`,
      managerName,
      totalContratsSignes: statsSource.totalContratsSignes,
      totalImmeublesVisites: statsSource.totalImmeublesVisites,
      totalRendezVousPris: statsSource.totalRendezVousPris,
      totalRefus: statsSource.totalRefus,
      totalAbsents: statsSource.totalAbsents,
      totalArgumentes: statsSource.totalArgumentes,
      totalPortesProspectes: statsSource.totalPortesProspectes,
      totalImmeublesProspectes: statsSource.totalImmeublesProspectes,
      zonesCount: currentZone ? 1 : 0,
      immeublesCount: commercial.immeubles?.length || 0,
      rank: rankInfo,
      points: rankInfo.points,
      lastStatusActivity,
    }
  }, [
    commercial,
    managers,
    personalStats,
    backendStats,
    rankInfo,
    currentZone,
    appliedStartDate,
    appliedEndDate,
    lastStatusActivity,
  ])

  // Zone active (+ immeubles créés par ce commercial dans la zone).
  const assignedZones = useMemo(() => {
    if (!currentZone) return []

    const immeublesCreatedByCommercial =
      currentZone.zone?.immeubles?.filter(imm => imm.commercialId === commercial?.id) || []

    return [
      {
        ...currentZone.zone,
        immeubles: immeublesCreatedByCommercial,
        assignmentDate: currentZone.assignedAt,
        immeublesCount: immeublesCreatedByCommercial.length,
      },
    ]
  }, [currentZone, commercial?.id])

  // Lignes de la table bâtiments (filtrées par le filtre de période unique).
  const buildingRows = useImmeublesTableData(
    commercial?.immeubles,
    appliedStartDate,
    appliedEndDate
  )

  // Portes filtrées + capacité déclarée (grille) = dénominateur de la couverture.
  const allPortes = useFilteredPortes(commercial?.immeubles, appliedStartDate, appliedEndDate)
  const totalDoorsGrid = (commercial?.immeubles || []).reduce(
    (sum, immeuble) => sum + buildingDoorCount(immeuble),
    0
  )

  // Couverture globale (prospectées / capacité déclarée).
  const couverture = useMemo(() => {
    const prospectees = (allPortes || []).filter(
      porte => String(porte.statut || '').toUpperCase() !== 'NON_VISITE'
    ).length
    return totalDoorsGrid > 0 ? Math.round((prospectees / totalDoorsGrid) * 100) : 0
  }, [allPortes, totalDoorsGrid])

  // 1 enregistrement par porte (le plus long) pour la modal façade.
  const porteSegmentMap = useMemo(() => {
    const map = new Map()
    recordingSegments.forEach(segment => {
      if (!segment.porteId) return
      const existing = map.get(segment.porteId)
      if (!existing || (segment.durationSec || 0) > (existing.durationSec || 0)) {
        map.set(segment.porteId, segment)
      }
    })
    return map
  }, [recordingSegments])

  const rawImmeublesById = useMemo(() => {
    const map = new Map()
    ;(commercial?.immeubles || []).forEach(imm => map.set(imm.id, imm))
    return map
  }, [commercial?.immeubles])

  const [selectedImmeubleId, setSelectedImmeubleId] = useState(null)

  const selectedFacade = useMemo(() => {
    const imm = rawImmeublesById.get(selectedImmeubleId)
    if (!imm) return null
    return buildFacadeFloors(imm, imm.portes || [], porteSegmentMap)
  }, [rawImmeublesById, selectedImmeubleId, porteSegmentMap])

  // Vue d'ensemble : 4 chiffres clés lisibles immédiatement.
  const overview = commercialData
    ? {
        contratsSignes: commercialData.totalContratsSignes,
        contratsValides: contratsValidesCount,
        couverture,
        points: commercialData.points,
        lastActivityLabel: formatRelativeActivityDate(commercialData.lastStatusActivity?.changedAt),
        lastActivityDesc: getActivityDescription(commercialData.lastStatusActivity),
      }
    : null

  // Performance : jeu de KPI resserré (5 au lieu de 10).
  const perfStats = commercialData
    ? [
        {
          label: 'Contrats signés',
          value: commercialData.totalContratsSignes,
          hint: 'Déclarés terrain',
        },
        {
          label: 'Contrats validés',
          value: contratsValidesCount,
          hint: 'Confirmés back-office',
        },
        { label: 'Rendez-vous pris', value: commercialData.totalRendezVousPris },
        { label: 'Argumentés', value: commercialData.totalArgumentes },
        { label: 'Refus', value: commercialData.totalRefus },
        { label: 'Absents', value: commercialData.totalAbsents },
      ]
    : []

  // Infos de contact (repli discret ; le directeur ne les regarde qu'occasionnellement).
  const personalInfo = commercialData
    ? [
        { label: 'Email', value: commercialData.email, icon: 'mail' },
        { label: 'Téléphone', value: commercialData.numTel || 'Non renseigné', icon: 'phone' },
        {
          label: 'Âge',
          value: commercialData.age == null ? 'Non renseigné' : `${commercialData.age} ans`,
          icon: 'user',
        },
        { label: 'Manager', value: commercialData.managerName, icon: 'users' },
        {
          label: 'Date de création',
          value: new Date(commercialData.createdAt).toLocaleDateString('fr-FR'),
          icon: 'calendar',
        },
      ]
    : []

  // Config prospection (mêmes graphiques qu'avant, section réutilisable).
  const prospection = {
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
  }

  return {
    commercialData,
    loading,
    error,
    dateFilter,
    overview,
    perfStats,
    personalInfo,
    prospection,
    assignedZones,
    buildings: {
      rows: buildingRows || [],
      onRowClick: row => setSelectedImmeubleId(row.id),
    },
    buildingModal: {
      facade: selectedFacade,
      open: Boolean(selectedFacade),
      onOpenChange: openState => {
        if (!openState) setSelectedImmeubleId(null)
      },
    },
  }
}
