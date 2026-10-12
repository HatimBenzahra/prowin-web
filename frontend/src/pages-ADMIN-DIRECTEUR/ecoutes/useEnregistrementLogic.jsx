import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useEcoutesUsers } from '@/hooks/ecoutes/useEcoutesUsers'
import { usePagination } from '@/hooks/utils/data/usePagination'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { RecordingService } from '@/services/audio'
import { getStatusFilterOptions } from '@/constants/domain/user-status'
import {
  buildUserLookup,
  enrichRecordingWithUser,
  filterRecordings,
  sortRecordings,
} from './ecoutes-utils'
import { useRecordingsCoaching } from './useRecordingsCoaching'

const RECENT_RECORDINGS_LIMIT = 60

export function useEnregistrementLogic() {
  const { allUsers, loading, error, refetch } = useEcoutesUsers()
  const { showSuccess, showError } = useErrorToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCommercialForRecordings, setSelectedCommercialForRecordings] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [loadingRecordings, setLoadingRecordings] = useState(false)
  const [playingRecording, setPlayingRecording] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ACTIF')
  const [recentRecordings, setRecentRecordings] = useState([])
  const [recentRecordingsTotalCount, setRecentRecordingsTotalCount] = useState(0)
  const [loadingRecentRecordings, setLoadingRecentRecordings] = useState(false)
  const [recentRecordingsError, setRecentRecordingsError] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)
  const [selectedRecordingIds, setSelectedRecordingIds] = useState(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [currentModalRecordingIndex, setCurrentModalRecordingIndex] = useState(null)
  const [speechScores, setSpeechScores] = useState(new Map())
  const speechScoresRef = useRef(speechScores)
  speechScoresRef.current = speechScores

  const statusFilterOptions = useMemo(
    () => [{ value: 'ALL', label: 'Tous' }, ...getStatusFilterOptions()],
    []
  )

  const filteredUsers = useMemo(() => {
    if (!allUsers) return []
    return allUsers.filter(user =>
      statusFilter === 'ALL' ? true : user?.status === statusFilter
    )
  }, [allUsers, statusFilter])

  const loadRecentRecordings = useCallback(async () => {
    if (!allUsers || allUsers.length === 0) {
      setRecentRecordings([])
      setRecentRecordingsTotalCount(0)
      return
    }

    setLoadingRecentRecordings(true)
    setRecentRecordingsError(null)

    try {
      const userLookup = buildUserLookup(allUsers)
      const { items, totalCount } = await RecordingService.getRecentRecordings(RECENT_RECORDINGS_LIMIT)
      const enriched = items.map(recording =>
        enrichRecordingWithUser(recording, userLookup, RecordingService.formatFileSize)
      )

      setRecentRecordings(enriched)
      setRecentRecordingsTotalCount(totalCount)
      setRecentRecordingsError(null)
    } catch (loadError) {
      console.warn('Erreur chargement enregistrements récents:', loadError)
      setRecentRecordings([])
      setRecentRecordingsTotalCount(0)
      setRecentRecordingsError('Impossible de charger les enregistrements récents')
    } finally {
      setLoadingRecentRecordings(false)
    }
  }, [allUsers])

  useEffect(() => {
    if (!allUsers) return
    loadRecentRecordings()
  }, [allUsers, loadRecentRecordings])

  const handleSort = useCallback(key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const resetSelection = useCallback(() => {
    setSelectedCommercialForRecordings(null)
    setRecordings([])
  }, [])

  useEffect(() => {
    if (!selectedCommercialForRecordings) return

    const stillVisible = filteredUsers.some(
      user =>
        user.id === selectedCommercialForRecordings.id &&
        user.userType === selectedCommercialForRecordings.userType
    )

    if (!stillVisible) {
      resetSelection()
    }
  }, [filteredUsers, selectedCommercialForRecordings, resetSelection])

  // Charger les enregistrements pour un utilisateur sélectionné
  const loadRecordingsForCommercial = useCallback(async commercial => {
    if (!commercial) {
      setRecordings([])
      return
    }

    setLoadingRecordings(true)
    try {
      // Utiliser userType pour charger les bons enregistrements (manager ou commercial)
      const userType = commercial.userType
      const recordingsData = await RecordingService.getRecordingsForUser(commercial.id, userType)
      setRecordings(recordingsData)
      showSuccess(
        `${recordingsData.length} enregistrement(s) chargé(s) pour ${commercial.prenom} ${commercial.nom}`
      )
    } catch (error) {
      console.error('Erreur chargement enregistrements:', error)
      showError('Erreur lors du chargement des enregistrements')
      setRecordings([])
    } finally {
      setLoadingRecordings(false)
    }
  }, [showSuccess, showError])

  const filteredRecordings = useMemo(
    () => filterRecordings(recordings, searchTerm, dateFrom, dateTo),
    [recordings, searchTerm, dateFrom, dateTo]
  )

  const sortedRecordings = useMemo(
    () => sortRecordings(filteredRecordings, sortConfig, speechScores),
    [filteredRecordings, sortConfig, speechScores]
  )

  // Utiliser le hook de pagination
  const {
    currentItems: currentRecordings,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    goToNextPage,
    goToPreviousPage,
    hasNextPage,
    hasPreviousPage,
  } = usePagination(sortedRecordings, 20)

  useEffect(() => {
    const allKeys = [
      ...recentRecordings.map(r => r.key),
      ...currentRecordings.map(r => r.key),
    ].filter(Boolean)
    const uniqueKeys = [...new Set(allKeys)]
    if (!uniqueKeys.length) return

    let active = true
    let timerId

    const fetchScores = async () => {
      if (!active) return

      const currentScores = speechScoresRef.current
      const keysToFetch = uniqueKeys.filter(k => {
        const cached = currentScores.get(k)
        return !cached || cached.status === 'pending' || cached.status === 'analyzing'
      })

      if (!keysToFetch.length) return

      try {
        const results = await RecordingService.getSpeechScores(keysToFetch)
        if (!active) return
        setSpeechScores(prev => {
          let changed = false
          for (const r of results) {
            const existing = prev.get(r.key)
            if (!existing || existing.status !== r.status || existing.score !== r.score) {
              changed = true
              break
            }
          }
          if (!changed) return prev

          const next = new Map(prev)
          results.forEach(r => { next.set(r.key, r) })
          return next
        })
        const hasInProgress = results.some(r => r.status === 'pending' || r.status === 'analyzing')
        if (hasInProgress && active) {
          timerId = setTimeout(fetchScores, 4000)
        }
      } catch {
        void 0
      }
    }

    fetchScores()

    return () => {
      active = false
      clearTimeout(timerId)
    }
  }, [recentRecordings, currentRecordings])

  const displayedRecordings = useMemo(
    () => [...recentRecordings, ...currentRecordings],
    [recentRecordings, currentRecordings]
  )
  const {
    analysesByKey,
    coachingStatusOf,
    retry: retryCoaching,
    setAnalysis,
  } = useRecordingsCoaching(displayedRecordings)

  const selectedCount = useMemo(
    () =>
      currentRecordings.reduce(
        (count, recording) => (selectedRecordingIds.has(recording.id) ? count + 1 : count),
        0
      ),
    [currentRecordings, selectedRecordingIds]
  )

  const toggleRecordingSelection = useCallback(id => {
    setSelectedRecordingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedRecordingIds(new Set())
  }, [])

  const toggleSelectAll = useCallback(() => {
    const selectableIds = currentRecordings.map(recording => recording.id)
    if (!selectableIds.length) return

    const allCurrentSelected = selectableIds.every(id => selectedRecordingIds.has(id))

    setSelectedRecordingIds(prev => {
      const next = new Set(prev)
      if (allCurrentSelected) {
        selectableIds.forEach(id => {
          next.delete(id)
        })
      } else {
        selectableIds.forEach(id => {
          next.add(id)
        })
      }
      return next
    })
  }, [currentRecordings, selectedRecordingIds])

  useEffect(() => {
    if (!selectedCommercialForRecordings && currentPage === 1) {
      setSelectedRecordingIds(new Set())
      return
    }

    setSelectedRecordingIds(new Set())
  }, [selectedCommercialForRecordings, currentPage])

  useEffect(() => {
    setSelectedRecordingIds(prev => {
      if (!prev.size) return prev

      const selectableIds = new Set(currentRecordings.map(recording => recording.id))

      let changed = false
      const next = new Set()

      prev.forEach(id => {
        if (selectableIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [currentRecordings])

  const handleBulkDownload = useCallback(async () => {
    if (!selectedRecordingIds.size) return

    setBulkDownloading(true)
    try {
      const toDownload = currentRecordings.filter(recording => selectedRecordingIds.has(recording.id))

      for (const recording of toDownload) {
        try {
          const url = recording.rawUrl || recording.url || await RecordingService.getStreamingUrl(recording.key)
          if (url) {
            RecordingService.downloadRecording(url, recording.filename)
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        } catch {
          console.warn('Erreur téléchargement:', recording.filename)
        }
      }

      showSuccess(`${toDownload.length} fichier(s) téléchargé(s)`)
      clearSelection()
    } finally {
      setBulkDownloading(false)
    }
  }, [selectedRecordingIds, currentRecordings, showSuccess, clearSelection])

  const currentModalRecording = useMemo(() => {
    if (currentModalRecordingIndex === null) return null
    return currentRecordings[currentModalRecordingIndex] || null
  }, [currentModalRecordingIndex, currentRecordings])

  const hasNextRecording =
    currentModalRecordingIndex !== null && currentModalRecordingIndex < currentRecordings.length - 1
  const hasPreviousRecording = currentModalRecordingIndex !== null && currentModalRecordingIndex > 0

  const openRecordingModal = useCallback(
    recording => {
      const index = currentRecordings.findIndex(item => item.id === recording.id)
      if (index >= 0) {
        setCurrentModalRecordingIndex(index)
      }
    },
    [currentRecordings]
  )

  const closeRecordingModal = useCallback(() => {
    setCurrentModalRecordingIndex(null)
  }, [])

  const goToNextRecording = useCallback(() => {
    setCurrentModalRecordingIndex(prev => {
      if (prev === null || prev >= currentRecordings.length - 1) return prev
      return prev + 1
    })
  }, [currentRecordings.length])

  const goToPreviousRecording = useCallback(() => {
    setCurrentModalRecordingIndex(prev => {
      if (prev === null || prev <= 0) return prev
      return prev - 1
    })
  }, [])

  useEffect(() => {
    if (currentModalRecordingIndex === null) return
    if (currentModalRecordingIndex >= currentRecordings.length) {
      setCurrentModalRecordingIndex(null)
    }
  }, [currentModalRecordingIndex, currentRecordings.length])

  const handleDownloadRecording = async recording => {
    try {
      const url = recording.url || recording.rawUrl || await RecordingService.getStreamingUrl(recording.key)
      if (url) {
        RecordingService.downloadRecording(url, recording.filename)
        showSuccess(`Téléchargement de ${recording.filename} démarré`)
      } else {
        showError('URL de téléchargement non disponible')
      }
    } catch {
      showError('Erreur lors de la génération du lien de téléchargement')
    }
  }

  const handlePlayRecording = async recording => {
    if (playingRecording?.id === recording.id) {
      setPlayingRecording(null)
      return
    }

    try {
      const streamingUrl = await RecordingService.getStreamingUrl(recording.key)

      if (!streamingUrl) {
        showError("Impossible de générer l'URL de streaming")
        return
      }

      const recordingWithStreamingUrl = {
        ...recording,
        url: streamingUrl,
      }

      setPlayingRecording(recordingWithStreamingUrl)
    } catch (error) {
      console.error('Erreur génération URL streaming:', error)
      showError('Erreur lors de la préparation de la lecture')
    }
  }

  const handleUserSelection = useCallback(user => {
    setSelectedCommercialForRecordings(user)
    loadRecordingsForCommercial(user)
  }, [loadRecordingsForCommercial])

  return {
    filteredUsers,
    allUsers,
    loading,
    error,
    refetch,
    searchTerm,
    setSearchTerm,
    selectedCommercialForRecordings,
    recordings,
    loadingRecordings,
    playingRecording,
    currentRecordings,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    goToNextPage,
    goToPreviousPage,
    hasNextPage,
    hasPreviousPage,
    filteredRecordingsCount: filteredRecordings.length,
    handleDownloadRecording,
    handlePlayRecording,
    resetSelection,
    handleUserSelection,
    statusFilter,
    setStatusFilter,
    statusFilterOptions,
    recentRecordings,
    recentRecordingsTotalCount,
    loadingRecentRecordings,
    recentRecordingsError,
    sortConfig,
    handleSort,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    selectedRecordingIds,
    selectedCount,
    toggleRecordingSelection,
    toggleSelectAll,
    clearSelection,
    handleBulkDownload,
    bulkDownloading,
    currentModalRecording,
    openRecordingModal,
    closeRecordingModal,
    goToNextRecording,
    goToPreviousRecording,
    hasNextRecording,
    hasPreviousRecording,
    speechScores,
    analysesByKey,
    coachingStatusOf,
    retryCoaching,
    setAnalysis,
  }
}
