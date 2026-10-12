import { useCallback, useEffect, useRef, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'

const PAGE_SIZE = 15
const POLL_MS = 6000

/**
 * Logique de l'interface de gestion : liste paginée + filtres + sélection.
 * `initialSubjectId` pré-règle le filtre sujet (ex. liste scopée à un
 * commercial/manager dans un modal) ; null = tous les sujets (comportement page).
 */
export function useCoachingManagement({ initialSubjectId = null } = {}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [statut, setStatutState] = useState('')
  const [search, setSearchState] = useState('')
  const [favorisOnly, setFavorisOnlyState] = useState(false)
  const [subjectId, setSubjectIdState] = useState(initialSubjectId)
  const [durationTier, setDurationTierState] = useState('')
  const [notAnalyzedOnly, setNotAnalyzedOnlyState] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [launching, setLaunching] = useState(false)
  const pollRef = useRef(null)

  const load = useCallback(
    async (withSpinner) => {
      if (withSpinner) setLoading(true)
      const res = await CoachingService.managementList({
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        statut: statut || null,
        search: search.trim() || null,
        favorisOnly: favorisOnly || null,
        subjectId: subjectId ?? null,
        durationTier: durationTier || null,
        notAnalyzedOnly: notAnalyzedOnly || null,
      })
      setItems(res.items || [])
      setTotal(res.total || 0)
      setLoading(false)
    },
    [page, statut, search, favorisOnly, subjectId, durationTier, notAnalyzedOnly],
  )

  useEffect(() => {
    load(true)
  }, [load])

  // Liste des sujets (commerciaux/managers) pour le filtre déroulant — une fois.
  useEffect(() => {
    CoachingService.coachableSubjects().then(setSubjects)
  }, [])

  // Rafraîchit les indicateurs (analyse terminée) sans spinner.
  useEffect(() => {
    pollRef.current = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [load])

  // Setters qui repartent en page 0.
  const setStatut = (v) => {
    setStatutState(v)
    setPage(0)
  }
  const setSearch = (v) => {
    setSearchState(v)
    setPage(0)
  }
  const setFavorisOnly = (v) => {
    setFavorisOnlyState(v)
    setPage(0)
  }
  const setSubjectId = (v) => {
    setSubjectIdState(v)
    setPage(0)
  }
  const setDurationTier = (v) => {
    setDurationTierState(v)
    setPage(0)
  }
  const setNotAnalyzedOnly = (v) => {
    setNotAnalyzedOnlyState(v)
    setPage(0)
  }

  const toggleSelect = (s3Key) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(s3Key)) n.delete(s3Key)
      else n.add(s3Key)
      return n
    })
  const clearSelection = () => setSelected(new Set())
  const selectAll = (keys) => setSelected(new Set(keys))

  const launch = useCallback(
    async (s3Keys) => {
      const keys = Array.isArray(s3Keys) ? s3Keys : [s3Keys]
      if (!keys.length) return
      setLaunching(true)
      try {
        await CoachingService.launchMany(keys)
        clearSelection()
        await load(false)
      } finally {
        setLaunching(false)
      }
    },
    [load],
  )

  const toggleFavori = useCallback(async (porteId, favori) => {
    setItems((prev) =>
      prev.map((it) => (it.porteId === porteId ? { ...it, favori } : it)),
    )
    try {
      await CoachingService.setFavori(porteId, favori)
    } catch {
      setItems((prev) =>
        prev.map((it) => (it.porteId === porteId ? { ...it, favori: !favori } : it)),
      )
    }
  }, [])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return {
    items,
    total,
    loading,
    page,
    pageCount,
    setPage,
    statut,
    setStatut,
    search,
    setSearch,
    favorisOnly,
    setFavorisOnly,
    subjectId,
    setSubjectId,
    durationTier,
    setDurationTier,
    notAnalyzedOnly,
    setNotAnalyzedOnly,
    subjects,
    selected,
    toggleSelect,
    clearSelection,
    selectAll,
    launching,
    launch,
    toggleFavori,
    reload: () => load(false),
  }
}
