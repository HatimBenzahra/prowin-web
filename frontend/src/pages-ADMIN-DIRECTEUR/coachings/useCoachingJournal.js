import { useCallback, useEffect, useRef, useState } from 'react'
import CoachingService from '@/services/coaching/coaching.service'
import { toJournalFilter } from './coachings-utils'

// Jours entiers par page : assez pour remplir l'écran sans charger toute la période.
const DAYS_PER_PAGE = 5

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

  /** Après un lancement : l'analyse créée remplace l'état « non analysé » de la ligne. */
  const setAnalysis = useCallback((s3Key, analysis) => {
    setRows(prev =>
      prev.map(r => (r.s3Key === s3Key ? { ...r, analysis: summaryOf(analysis) } : r))
    )
  }, [])

  return {
    rows,
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
