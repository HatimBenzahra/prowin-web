import { useCallback, useEffect, useRef, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'
import { isInProgress } from '../coaching/CoachingComponents'
import { toJournalFilter } from './coachings-utils'

// Jours entiers par page : assez pour remplir l'écran sans charger toute la période.
const DAYS_PER_PAGE = 5
// Suivi des analyses en cours dans la liste, aligné sur les autres écrans coaching.
const POLL_MS = 6000

/** Résumé d'analyse du journal, depuis une analyse complète (après un lancement). */
const summaryOf = a =>
  a && {
    id: a.id,
    status: a.status,
    quality: a.quality,
    score: a.score,
    band: a.band,
    executionScore: a.executionScore,
    outcomeScore: a.outcomeScore,
    visitResult: a.visitResult,
    nonSaleReason: a.nonSaleReason,
    productStatuses: (a.productStatuses || []).map(p => ({ key: p.key, status: p.status })),
  }

/**
 * Journal des écoutes, paginé par jours entiers : une page initiale, puis
 * « jours précédents » via le curseur `nextBefore`. Tout changement de filtre
 * repart de zéro ; une réponse arrivée après un changement est ignorée.
 */
export function useCoachingJournal(filters) {
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState({ hasMore: false, nextBefore: null })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const generation = useRef(0)
  const filterKey = JSON.stringify(filters)

  const fetchPage = useCallback(
    before =>
      CoachingService.journal({
        ...toJournalFilter(JSON.parse(filterKey)),
        days: DAYS_PER_PAGE,
        before,
      }),
    [filterKey]
  )

  const reload = useCallback(async () => {
    const gen = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const page = await fetchPage(null)
      if (gen !== generation.current) return
      setRows(page.rows)
      setCursor({ hasMore: page.hasMore, nextBefore: page.nextBefore })
    } catch (err) {
      if (gen !== generation.current) return
      setRows([])
      setCursor({ hasMore: false, nextBefore: null })
      setError(err)
    } finally {
      if (gen === generation.current) setLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    reload()
  }, [reload])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !cursor.hasMore) return
    const gen = generation.current
    setLoadingMore(true)
    try {
      const page = await fetchPage(cursor.nextBefore)
      if (gen !== generation.current) return
      setRows(prev => [...prev, ...page.rows])
      setCursor({ hasMore: page.hasMore, nextBefore: page.nextBefore })
    } catch (err) {
      if (gen === generation.current) setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, fetchPage, loading, loadingMore])

  /** Le favori est porté par la porte : toutes ses lignes changent ensemble. */
  const setFavori = useCallback(async (porteId, favori) => {
    const apply = value =>
      setRows(prev => prev.map(r => (r.porteId === porteId ? { ...r, favori: value } : r)))
    apply(favori)
    try {
      await CoachingService.setFavori(porteId, favori)
    } catch (err) {
      apply(!favori)
      throw err
    }
  }, [])

  /**
   * Archive ou désarchive : dans les deux vues, la ligne quitte la liste affichée
   * (archivés masqués, ou seulement eux). `restoreRow` la remet en place (annulation).
   */
  const setArchived = useCallback(async (row, archived) => {
    await CoachingService.setArchive(row.s3Key, archived)
    setRows(prev => prev.filter(r => r.s3Key !== row.s3Key))
  }, [])
  const restoreRow = useCallback(row => {
    setRows(prev =>
      prev.some(r => r.s3Key === row.s3Key)
        ? prev
        : [...prev, row].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    )
  }, [])

  /** Une analyse nouvelle ou suivie remplace le résumé de sa ligne. */
  const setAnalysis = useCallback((s3Key, analysis) => {
    setRows(prev =>
      prev.map(r => (r.s3Key === s3Key ? { ...r, analysis: summaryOf(analysis) } : r))
    )
  }, [])

  /** Lance l'analyse d'un audio (même mutation que la gestion) ; rend l'analyse créée. */
  const [launching, setLaunching] = useState(() => new Set())
  const launch = useCallback(
    async s3Key => {
      setLaunching(prev => new Set(prev).add(s3Key))
      try {
        await CoachingService.launchMany([s3Key])
        const [created] = await CoachingService.byS3Keys([s3Key])
        if (created) setAnalysis(s3Key, created)
        return created ?? null
      } finally {
        setLaunching(prev => {
          const next = new Set(prev)
          next.delete(s3Key)
          return next
        })
      }
    },
    [setAnalysis]
  )

  // Les lignes « En cours » passent d'elles-mêmes à leur score, sans recharger la liste.
  const runningKeys = rows
    .filter(r => isInProgress(r.analysis?.status))
    .map(r => r.s3Key)
    .join('|')
  useEffect(() => {
    if (!runningKeys) return
    const t = setInterval(async () => {
      try {
        const fresh = await CoachingService.byS3Keys(runningKeys.split('|'))
        for (const a of fresh) if (!isInProgress(a.status)) setAnalysis(a.s3KeyOriginal, a)
      } catch {
        // Réessayé au tour suivant.
      }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [runningKeys, setAnalysis])

  return {
    rows,
    setArchived,
    restoreRow,
    launch,
    launching,
    loading,
    loadingMore,
    error,
    hasMore: cursor.hasMore,
    loadMore,
    reload,
    setFavori,
    setAnalysis,
  }
}
