import { useEffect, useMemo, useRef, useState } from 'react'
import { useRole } from '@/contexts/userole'
import {
  useCommercials,
  useContratsValidesAggregate,
  useManagers,
  useProspectionPipeline,
  useStatsActivityByOwner,
  useStatsEffort,
  useStatsPeriodComparison,
  useStatsTimeline,
  useZoneStatistics,
} from '@/services'
import { useRoleBasedData } from '@/hooks/metier/permissions/useRoleBasedData'
import { useDateFilter } from '@/hooks/utils/filters/useDateFilter'
import CoachingService from '@/services/coaching/coaching.service'
import { defaultRange, granularityForRange, toIsoEnd, toIsoStart } from './stats-period'
import { DEFAULT_TAB, TAB_QUERIES } from './stats-tabs'

export const SCOPE_FILTERS = [
  { value: 'all', label: 'Toute l’équipe' },
  { value: 'commercials', label: 'Commerciaux' },
  { value: 'managers', label: 'Managers' },
]

const fullName = (person, fallbackLabel, id) =>
  `${person?.prenom || ''} ${person?.nom || ''}`.trim() || `${fallbackLabel} #${id}`

const parseOwnerSelection = selectedOwner => {
  if (!selectedOwner || selectedOwner === 'all') {
    return { ownerType: undefined, ownerId: undefined }
  }

  const [type, rawId] = selectedOwner.split(':')
  const ownerId = Number(rawId)
  if (!Number.isFinite(ownerId)) return { ownerType: undefined, ownerId: undefined }

  return { ownerType: type, ownerId }
}

export function useStatistiquesLogic() {
  const { currentRole } = useRole()
  // Période appliquée dès l'initialisation, et non dans un effet de montage : sinon
  // le premier rendu part sans bornes de dates, et le backend agrège alors tout
  // l'historique (`buildStatusHistoryDateWhere` renvoie `{}` sans bornes) pour un
  // résultat jeté au rendu suivant. Sans bornes, il n'y aurait de surcroît pas de
  // période précédente et la page perdrait tous ses écarts.
  const dateFilter = useDateFilter(defaultRange())
  const [scopeType, setScopeType] = useState('all')
  const [selectedOwner, setSelectedOwner] = useState('all')
  const [tab, setTab] = useState(DEFAULT_TAB)

  /**
   * Les requêtes de l'onglet ouvert seulement : celles des onglets fermés ne partent
   * pas. Une fois l'onglet visité, react-query garde le résultat (staleTime 5 min),
   * donc y revenir ne relance aucun appel.
   */
  const needs = useMemo(() => {
    const queries = TAB_QUERIES[tab] || []
    return name => queries.includes(name)
  }, [tab])

  const { appliedStartDate, appliedEndDate } = dateFilter
  const ownerSelection = useMemo(() => parseOwnerSelection(selectedOwner), [selectedOwner])

  const startIso = useMemo(() => toIsoStart(appliedStartDate), [appliedStartDate])
  const endIso = useMemo(() => toIsoEnd(appliedEndDate), [appliedEndDate])
  const granularity = useMemo(() => granularityForRange(startIso, endIso), [startIso, endIso])

  const filters = useMemo(
    () => ({
      scopeType,
      ownerType: ownerSelection.ownerType,
      ownerId: ownerSelection.ownerId,
      startDate: startIso,
      endDate: endIso,
    }),
    [scopeType, ownerSelection.ownerType, ownerSelection.ownerId, startIso, endIso]
  )

  const contratsFilters = useMemo(() => ({ ...filters, granularity }), [filters, granularity])

  /**
   * Le pipeline est un **stock** : il ne reçoit que le périmètre, jamais les bornes de
   * dates. « Combien de portes attendent un repassage » se lit maintenant, pas sur les
   * 30 derniers jours.
   */
  const pipelineFilters = useMemo(
    () => ({
      scopeType,
      ownerType: ownerSelection.ownerType,
      ownerId: ownerSelection.ownerId,
    }),
    [scopeType, ownerSelection.ownerType, ownerSelection.ownerId]
  )

  const {
    data: comparison,
    loading: comparisonLoading,
    error: comparisonError,
  } = useStatsPeriodComparison(filters)

  // Les requêtes d'onglet fermé ne partent pas (`enabled`). Rappel important : une
  // requête désactivée reste « pending » pour react-query, donc son `loading` vaut
  // `true` — il ne faut le lire qu'à travers `needs(...)`, jamais brut.
  const {
    data: timeline,
    loading: timelineLoading,
    error: timelineError,
  } = useStatsTimeline(filters, { enabled: needs('timeline') })

  const {
    data: ownerActivity,
    loading: ownerActivityLoading,
    error: ownerActivityError,
  } = useStatsActivityByOwner(filters, { enabled: needs('ownerActivity') })

  const {
    data: effort,
    loading: effortLoading,
    error: effortError,
  } = useStatsEffort(filters, { enabled: needs('effort') })

  const {
    data: contratsValides,
    loading: contratsValidesLoading,
    error: contratsValidesError,
  } = useContratsValidesAggregate(contratsFilters)

  const {
    data: pipeline,
    loading: pipelineLoading,
    error: pipelineError,
  } = useProspectionPipeline(pipelineFilters, { enabled: needs('pipeline') })

  const {
    data: zoneStats,
    loading: zoneStatsLoading,
    error: zoneStatsError,
  } = useZoneStatistics({ enabled: needs('zoneStats') })
  const { data: rawCommercials, loading: commercialsLoading } = useCommercials()
  const { data: rawManagers, loading: managersLoading } = useManagers()

  const filteredCommercials = useRoleBasedData('commerciaux', rawCommercials)
  const filteredManagers = useRoleBasedData('managers', rawManagers)

  /** Options du sélecteur d'intervenant, restreintes au périmètre courant. */
  const ownerOptions = useMemo(() => {
    const options = []
    const commercials = filteredCommercials || []
    const managers = filteredManagers || []

    if (scopeType === 'all' || scopeType === 'commercials') {
      commercials.forEach(commercial => {
        options.push({
          value: `commercial:${commercial.id}`,
          label: fullName(commercial, 'Commercial', commercial.id),
        })
      })
    }

    if (scopeType === 'all' || scopeType === 'managers') {
      managers.forEach(manager => {
        options.push({
          value: `manager:${manager.id}`,
          label: fullName(manager, 'Manager', manager.id),
        })
      })
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [filteredCommercials, filteredManagers, scopeType])

  // Changer de périmètre peut rendre l'intervenant sélectionné hors-champ.
  useEffect(() => {
    if (selectedOwner === 'all') return
    if (!ownerOptions.some(option => option.value === selectedOwner)) {
      setSelectedOwner('all')
    }
  }, [ownerOptions, selectedOwner])

  // ── Comparatif de scoring coaching ────────────────────────────────────────
  // Réservé aux rôles admin/directeur côté backend : un échec de permission ne
  // doit pas faire tomber la page, il se traduit par une section vide.
  // Appel REST, donc hors cache react-query : la clé déjà chargée est mémorisée à la
  // main, sinon passer de l'onglet Coaching à Équipe et revenir relancerait l'appel.
  const [scoreboard, setScoreboard] = useState(null)
  const [scoreboardLoading, setScoreboardLoading] = useState(false)
  const scoreboardKeyRef = useRef(null)
  const scoreboardEnabled = needs('scoreboard')

  useEffect(() => {
    if (!scoreboardEnabled) return

    const key = `${startIso}|${endIso}`
    if (scoreboardKeyRef.current === key) return
    scoreboardKeyRef.current = key

    let active = true
    setScoreboardLoading(true)
    CoachingService.scoreboard(startIso, endIso)
      .then(data => {
        if (!active) return
        setScoreboard(data)
        // Le service avale ses erreurs et renvoie `null` : on rouvre la porte à une
        // nouvelle tentative plutôt que de figer la section vide.
        if (!data) scoreboardKeyRef.current = null
      })
      .finally(() => {
        if (active) setScoreboardLoading(false)
      })

    return () => {
      active = false
    }
  }, [startIso, endIso, scoreboardEnabled])

  /**
   * Chargement du **bandeau permanent** : la rangée de KPI, seule chose affichée
   * hors onglets. C'est elle, et elle seule, qui décide du squelette plein écran —
   * attendre les requêtes des six onglets faisait dépendre le premier affichage de
   * la plus lente des dix.
   *
   * `useCommercials` / `useManagers` n'y figurent pas : ils ne remplissent que les
   * options du sélecteur d'intervenant, qui peut arriver après.
   */
  const headerFetching = comparisonLoading || contratsValidesLoading

  /** Chargement de l'onglet ouvert — les requêtes désactivées sont ignorées. */
  const tabFetching =
    (needs('pipeline') && pipelineLoading) ||
    (needs('timeline') && timelineLoading) ||
    (needs('effort') && effortLoading) ||
    (needs('ownerActivity') && ownerActivityLoading) ||
    (needs('zoneStats') && zoneStatsLoading) ||
    (needs('scoreboard') && scoreboardLoading)

  const fetching = headerFetching || tabFetching || commercialsLoading || managersLoading

  /**
   * Seul le tout premier chargement remplace la page par un squelette.
   *
   * `useApiCall` met `isFetching` dans son `loading`, donc chaque application de
   * filtre repasse les requêtes en chargement. Gater la page entière sur ce drapeau
   * ferait clignoter tout l'écran à chaque changement de période — sur une page
   * pilotée par ses filtres, c'est le geste le plus fréquent. Les cartes gardent
   * donc leurs valeurs pendant le rafraîchissement.
   */
  const hasLoadedOnce = useRef(false)
  if (!headerFetching) hasLoadedOnce.current = true
  const loading = headerFetching && !hasLoadedOnce.current

  // Même principe par onglet : le squelette d'onglet ne s'affiche qu'à sa première
  // visite. Ensuite, changer de période garde les cartes affichées.
  const hasLoadedTab = useRef({})
  if (!tabFetching) hasLoadedTab.current[tab] = true

  const error =
    comparisonError ||
    contratsValidesError ||
    (needs('timeline') && timelineError) ||
    (needs('ownerActivity') && ownerActivityError) ||
    (needs('effort') && effortError) ||
    (needs('pipeline') && pipelineError) ||
    (needs('zoneStats') && zoneStatsError) ||
    null

  const activeFiltersCount = (scopeType !== 'all' ? 1 : 0) + (selectedOwner !== 'all' ? 1 : 0)

  const resetScope = () => {
    setScopeType('all')
    setSelectedOwner('all')
  }

  const periodLabel = useMemo(() => {
    if (!appliedStartDate && !appliedEndDate) return 'Toute la période'
    const format = value =>
      value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '…'
    return `${format(appliedStartDate)} → ${format(appliedEndDate)}`
  }, [appliedStartDate, appliedEndDate])

  const scopeLabel = useMemo(() => {
    if (selectedOwner !== 'all') {
      return ownerOptions.find(option => option.value === selectedOwner)?.label || 'Intervenant'
    }
    return SCOPE_FILTERS.find(filter => filter.value === scopeType)?.label || 'Toute l’équipe'
  }, [ownerOptions, scopeType, selectedOwner])

  return {
    loading,
    // Rafraîchissement en cours alors que des données sont déjà affichées : la page
    // le signale discrètement plutôt que de se vider.
    fetching: fetching && hasLoadedOnce.current,
    // Premier chargement des données de l'onglet ouvert : le contenu de l'onglet
    // montre un squelette, sinon ses cartes annonceraient « aucune donnée » le temps
    // de la requête.
    tabLoading: tabFetching && !hasLoadedTab.current[tab],
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
    currentRole,
    // Données
    current: comparison?.current || null,
    previous: comparison?.previous || null,
    timeline: timeline || [],
    ownerActivity: ownerActivity || [],
    effort: effort || null,
    contratsValides: contratsValides || null,
    pipeline: pipeline || null,
    zoneStats: zoneStats || [],
    scoreboard,
    scoreboardLoading,
  }
}
