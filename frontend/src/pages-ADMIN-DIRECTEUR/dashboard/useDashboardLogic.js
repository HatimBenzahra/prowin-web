import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  useCommercials,
  useManagers,
  useDirecteurs,
  useStatistics,
  useImmeubles,
  useAllCurrentAssignments,
  usePortesModifiedToday,
  usePortesRdvToday,
} from '@/hooks/metier/use-api'
import { useRanking, useOffreDistribution } from '@/hooks/metier/api/gamification'
import { gql } from '@/services/core/graphql'

const GET_SEGMENTS_TODAY = `
  query RecordingSegmentsToday($statut: String, $limit: Int) {
    recordingSegmentsToday(statut: $statut, limit: $limit) {
      id
      porteId
      porteNumero
      porteEtage
      immeubleAdresse
      immeubleId
      commercialNom
      statut
      durationSec
      status
      streamingUrl
      createdAt
    }
  }
`

function computePeriodKey(mode) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return mode === 'DAILY' ? `${y}-${m}-${d}` : `${y}-${m}`
}

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function useDashboardLogic() {
  const [currentRdvPage, setCurrentRdvPage] = useState(1)
  const [selectedPorteId, setSelectedPorteId] = useState(null)
  const [segmentFilter, setSegmentFilter] = useState(
    () => sessionStorage.getItem('dashboard-segment-filter') || 'TOUS'
  )
  const [segments, setSegments] = useState([])
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const ITEMS_PER_PAGE = 4

  const [perfMode, setPerfMode] = useState('MONTHLY')
  const perfPeriodKey = useMemo(() => computePeriodKey(perfMode), [perfMode])
  const { data: ranking, loading: rankingLoading } = useRanking(perfMode, perfPeriodKey)

  const [offreMonth, setOffreMonth] = useState(currentMonthKey)
  const { data: offreDistribution, loading: offreDistributionLoading } =
    useOffreDistribution(offreMonth)

  const { data: commercials, loading: loadingCommercials } = useCommercials()
  const { data: managers, loading: loadingManagers } = useManagers()
  const { data: directeurs, loading: loadingDirecteurs } = useDirecteurs()
  const { data: statistics, loading: loadingStats } = useStatistics()
  const { data: immeubles, loading: loadingImmeubles } = useImmeubles()
  const { data: assignments, loading: loadingAssignments } = useAllCurrentAssignments()
  const { data: portesModifiedToday, loading: loadingPortesModified } = usePortesModifiedToday()
  const { data: rdvToday, loading: loadingRdvToday } = usePortesRdvToday()

  const fetchSegments = useCallback(async statut => {
    setSegmentsLoading(true)
    try {
      const response = await gql(GET_SEGMENTS_TODAY, { statut, limit: 15 })
      setSegments(response.recordingSegmentsToday || [])
    } catch {
      setSegments([])
    } finally {
      setSegmentsLoading(false)
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('dashboard-segment-filter', segmentFilter || '')
    fetchSegments(segmentFilter === 'TOUS' ? null : segmentFilter)
  }, [segmentFilter, fetchSegments])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Calcul des stats à partir des portes modifiées aujourd'hui
  const totals = useMemo(() => {
    if (!portesModifiedToday)
      return {
        contrats: 0,
        rdv: 0,
        refus: 0,
        absents: 0,
        argumentes: 0,
        repassages: 0,
        portes: 0,
        immeubles: 0,
      }

    const stats = {
      contrats: 0,
      rdv: 0,
      refus: 0,
      absents: 0,
      argumentes: 0,
      repassages: 0,
      portes: portesModifiedToday.length,
      immeubles: 0,
    }

    portesModifiedToday.forEach(porte => {
      if (porte.statut === 'CONTRAT_SIGNE') stats.contrats += porte.nbContrats || 1
      else if (porte.statut === 'RENDEZ_VOUS_PRIS') stats.rdv++
      else if (porte.statut === 'REFUS') stats.refus++
      else if (porte.statut === 'ABSENT') stats.absents++
      else if (porte.statut === 'ARGUMENTE') stats.argumentes++
      else if (porte.statut === 'NECESSITE_REPASSAGE') stats.repassages++
    })

    const immeubleIds = new Set(portesModifiedToday.map(p => p.immeubleId))
    stats.immeubles = immeubleIds.size

    return stats
  }, [portesModifiedToday])

  const tauxConversion =
    totals.contrats + totals.rdv + totals.refus > 0
      ? `${Math.round((totals.contrats / (totals.contrats + totals.rdv + totals.refus)) * 100)}%`
      : '0%'

  // Pagination des rendez-vous
  const paginatedRdv = useMemo(() => {
    if (!rdvToday) return { items: [], totalPages: 0, startIndex: 0, endIndex: 0 }

    const startIndex = (currentRdvPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const items = rdvToday.slice(startIndex, endIndex)
    const totalPages = Math.ceil(rdvToday.length / ITEMS_PER_PAGE)

    return { items, totalPages, startIndex, endIndex }
  }, [rdvToday, currentRdvPage])

  const top3 = useMemo(() => {
    if (!ranking) return []
    return ranking.filter(e => e.points > 0).slice(0, 3)
  }, [ranking])

  const offreTotalContrats = useMemo(() => {
    if (!offreDistribution?.length) return 0
    return offreDistribution.reduce((s, e) => s + e.count, 0)
  }, [offreDistribution])

  const offreMaxCount = useMemo(() => {
    if (!offreDistribution?.length) return 1
    return offreDistribution[0].count
  }, [offreDistribution])

  const isLoading =
    loadingCommercials ||
    loadingManagers ||
    loadingDirecteurs ||
    loadingStats ||
    loadingImmeubles ||
    loadingAssignments ||
    loadingPortesModified ||
    loadingRdvToday

  return {
    today,
    totals,
    tauxConversion,
    paginatedRdv,
    currentRdvPage,
    setCurrentRdvPage,
    selectedPorteId,
    setSelectedPorteId,
    isLoading,
    segments,
    segmentsLoading,
    segmentFilter,
    setSegmentFilter,

    perfMode,
    setPerfMode,
    perfPeriodKey,
    top3,
    rankingLoading,

    offreMonth,
    setOffreMonth,
    offreDistribution,
    offreDistributionLoading,
    offreTotalContrats,
    offreMaxCount,

    data: {
      commercials,
      managers,
      directeurs,
      statistics,
      immeubles,
      assignments,
      rdvToday,
      portesModifiedToday,
    },
  }
}
