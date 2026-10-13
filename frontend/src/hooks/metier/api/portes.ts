/**
 * @fileoverview Hooks for Porte entity
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../../services/api'
import type {
  Porte,
  CreatePorteInput,
  UpdatePorteInput,
} from '../../../types/api'
import {
  useApiCall,
  useApiMutation,
  UseApiState,
  UseApiListState,
  UseApiActions,
  UseApiMutation,
} from './core'

export function usePortes(): UseApiListState<Porte> & UseApiActions {
  return useApiCall(api.portes.getAll, [], 'portes')
}

export function usePorte(id: number | null): UseApiState<Porte> & UseApiActions {
  return useApiCall(() => api.portes.getById(id!), [id], 'portes', { enabled: id != null })
}

export function usePortesByImmeuble(immeubleId: number): UseApiListState<Porte> & UseApiActions {
  return useApiCall(() => api.portes.getByImmeuble(immeubleId), [immeubleId], 'portes')
}

export function useCreatePorte(): UseApiMutation<CreatePorteInput, Porte> {
  return useApiMutation(api.portes.create, 'portes')
}

export function useUpdatePorte(): UseApiMutation<UpdatePorteInput, Porte> {
  return useApiMutation(api.portes.update, 'portes', 'UPDATE_PORTE')
}

export function useRemovePorte(): UseApiMutation<number, Porte> {
  return useApiMutation(api.portes.remove, 'portes')
}

export function usePortesModifiedToday(
  immeubleId?: number
): UseApiListState<Porte> & UseApiActions {
  return useApiCall(
    () => api.portes.getModifiedToday(immeubleId),
    [immeubleId],
    'portes-modified-today'
  )
}

export function usePortesRdvToday(): UseApiListState<Porte> & UseApiActions {
  return useApiCall(() => api.portes.getRdvToday(), [], 'portes-rdv-today')
}

export function usePorteStatistics(immeubleId: number): UseApiState<any> & UseApiActions {
  return useApiCall(
    () => api.portes.getStatistics(immeubleId),
    [immeubleId],
    'porte-statistics'
  )
}

interface UseInfiniteApiListState<T> {
  data: T[]
  loading: boolean
  error: string | null
  hasMore: boolean
  isFetchingMore: boolean // NEW: Separate state for pagination loading
  loadMore: () => Promise<void>
  reset: () => void
  updateLocalData: (id: number, changes: Partial<T>) => void
}

export function useInfinitePortesByImmeuble(
  immeubleId: number | null,
  pageSize = 20,
  etage?: number | null
): UseInfiniteApiListState<Porte> & UseApiActions {
  const [state, setState] = useState<{
    data: Porte[]
    loading: boolean
    error: string | null
    hasMore: boolean
    page: number
    isFetchingMore: boolean // NEW
  }>({
    data: [],
    loading: false,
    error: null,
    hasMore: true,
    page: 0,
    isFetchingMore: false,
  })

  // Réinitialiser quand l'immeuble ou l'étage change
  useEffect(() => {
     if (immeubleId) {
        setState({
            data: [],
            loading: true,
            error: null,
            hasMore: true,
            page: 0,
            isFetchingMore: false
        })
        fetchPage(0, true)
     }
  }, [immeubleId, etage]) // Add etage dependency

  const fetchPage = useCallback(
    async (pageToFetch: number, isReset: boolean = false) => {
      if (!immeubleId) return

      // Si chargement initial, mettre loading. Si pagination, mettre isFetchingMore
      const isInitialLoad = isReset || state.data.length === 0
      setState(prev => ({
        ...prev,
        loading: isInitialLoad,
        isFetchingMore: !isInitialLoad,
        error: null
      }))

      try {
        const skip = pageToFetch * pageSize
        // Pass etage to API call
        const newPortes = await api.portes.getByImmeuble(immeubleId, skip, pageSize, etage || undefined)

        setState(prev => {
           // Si reset, on remplace tout. Sinon on ajoute.
           // On vérifie les doublons par sécurité (bien que skip/take devrait gérer ça)
           const existingIds = isReset ? new Set() : new Set(prev.data.map(p => p.id))
           const uniqueNewPortes = newPortes.filter(p => !existingIds.has(p.id))

           return {
            data: isReset ? newPortes : [...prev.data, ...uniqueNewPortes],
            loading: false,
            isFetchingMore: false,
            error: null,
            hasMore: newPortes.length === pageSize, // Si on a reçu moins que demandé, c'est la fin
            page: pageToFetch,
          }
        })
      } catch (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          isFetchingMore: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }))
      }
    },
    [immeubleId, pageSize, etage, state.data.length]
  )


  const loadMore = useCallback(async () => {
    if (state.loading || !state.hasMore) return
    await fetchPage(state.page + 1)
  }, [state.loading, state.hasMore, state.page, fetchPage])

  const refetch = useCallback(async () => {
     // Recharger la premiere page et reinitialiser
     await fetchPage(0, true)
  }, [fetchPage])
  
  const reset = useCallback(() => {
    setState({
        data: [],
        loading: false,
        error: null,
        hasMore: true,
        page: 0,
        isFetchingMore: false
    })
    // fetchPage(0, true) // Optional: auto reload on reset
  }, [])

  const updateLocalData = useCallback((id: number, changes: Partial<Porte>) => {
     setState(prev => ({
        ...prev,
        data: prev.data.map(p => p.id === id ? { ...p, ...changes } : p)
     }))
  }, [])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    isFetchingMore: state.isFetchingMore,
    loadMore,
    refetch,
    reset,
    updateLocalData
  }
}

// =============================================================================
// Status Historique Hooks
// =============================================================================

export function useStatusHistoriqueByPorte(porteId: number | null): UseApiState<any[]> & UseApiActions {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!porteId) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.portes.getStatusHistorique(porteId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'historique')
    } finally {
      setLoading(false)
    }
  }, [porteId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}

export function useRecordingSegmentsByPorte(porteId: number | null): UseApiState<any[]> & UseApiActions {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!porteId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.portes.getRecordingSegments(porteId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement segments')
    } finally {
      setLoading(false)
    }
  }, [porteId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

export function useStatusHistoriqueByImmeuble(immeubleId: number | null): UseApiState<any[]> & UseApiActions {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!immeubleId) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.portes.getStatusHistoriqueByImmeuble(immeubleId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement de l\'historique')
    } finally {
      setLoading(false)
    }
  }, [immeubleId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}
