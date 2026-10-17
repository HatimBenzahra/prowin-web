import { useState, useCallback, useEffect } from 'react'
import { useParams, useOutletContext, useNavigate } from 'react-router-dom'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import {
  useInfinitePortesByImmeuble,
  useImmeuble,
  useUpdatePorte,
  useAddEtageToImmeuble,
  useAddPorteToEtage,
  useRemoveEtageFromImmeuble,
  useRemovePorteFromEtage,
  usePorteStatistics,
} from '@/hooks/metier/use-api'
import { useStatutOptions } from './useStatutOptions'

export function usePortesLogic() {
  const { immeubleId } = useParams()
  const navigate = useNavigate()
  
  // Récupère la ref de scroll depuis le layout
  const { scrollContainerRef } = useOutletContext() || {}
  
  const { showError, showSuccess } = useErrorToast()
  
  // Statut Options Hook
  const statutOptions = useStatutOptions()

  // --- States ---
  const [selectedPorte, setSelectedPorte] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [addingEtage, setAddingEtage] = useState(false)
  const [addingPorteToEtage, setAddingPorteToEtage] = useState(false)

  // Mode d'affichage (persistent)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(`viewMode-${immeubleId}`) || 'rapide'
    } catch {
      return 'rapide'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`viewMode-${immeubleId}`, viewMode)
    } catch { /* ignore */ }
  }, [viewMode, immeubleId])

  // Formulaire d'édition
  const [editForm, setEditForm] = useState({
    statut: '',
    commentaire: '',
    rdvDate: '',
    rdvTime: '',
    nomPersonnalise: '',
    nbContrats: 1,
  })

  // Filtres (Etage)
  const [selectedFloor, setSelectedFloor] = useState(null)

  // --- Data Fetching ---
  const {
    data: portes,
    loading: portesLoading,
    refetch: refetchPortes,
    loadMore,
    hasMore,
    isFetchingMore,
    updateLocalData
  } = useInfinitePortesByImmeuble(parseInt(immeubleId, 10), 20, selectedFloor)

  const { data: statsData, refetch: refetchStats } = usePorteStatistics(parseInt(immeubleId, 10))
  
  const { data: immeuble, loading: immeubleLoading, refetch: refetchImmeuble } = useImmeuble(
    parseInt(immeubleId, 10)
  )

  // --- Mutations ---
  const { mutate: updatePorte } = useUpdatePorte()
  const { mutate: addEtage } = useAddEtageToImmeuble()
  const { mutate: addPorteToEtage } = useAddPorteToEtage()
  const { mutate: removeEtage } = useRemoveEtageFromImmeuble()
  const { mutate: removePorteFromEtage } = useRemovePorteFromEtage()

  // --- Helpers ---
  const withScrollRestore = useCallback(
    async fn => {
      const el = scrollContainerRef?.current || document.querySelector('.portes-scroll-container')
      const y = el?.scrollTop ?? 0
      await fn()
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (el) el.scrollTop = y
        })
      )
    },
    [scrollContainerRef]
  )

  // --- Infinite Scroll Handler ---
  useEffect(() => {
    const handleScroll = () => {
      const container = scrollContainerRef?.current
      if (container) {
          const { scrollTop, scrollHeight, clientHeight } = container
          if (
            scrollTop + clientHeight >= scrollHeight - 500 &&
            !portesLoading &&
            hasMore
          ) {
            const savedScrollTop = container.scrollTop
            loadMore().then(() => {
              requestAnimationFrame(() => {
                if (container.scrollTop < savedScrollTop) {
                  container.scrollTop = savedScrollTop
                }
              })
            })
          }
      } else {
        if (
          window.innerHeight + window.scrollY >= document.documentElement.offsetHeight - 500 &&
          !portesLoading &&
          hasMore
        ) {
          loadMore()
        }
      }
    }

    const container = scrollContainerRef?.current
    if (container) {
        container.addEventListener('scroll', handleScroll)
        handleScroll()
    } else {
        window.addEventListener('scroll', handleScroll)
    }

    return () => {
        if (container) {
            container.removeEventListener('scroll', handleScroll)
        } else {
            window.removeEventListener('scroll', handleScroll)
        }
    }
  }, [scrollContainerRef, loadMore, portesLoading, hasMore, selectedFloor])

  // --- Handlers ---

  const handleFloorSelect = useCallback((etage) => {
    if (selectedFloor === etage) {
        setSelectedFloor(null)
    } else {
        setSelectedFloor(etage)
    }
  }, [selectedFloor])

  const handleEditPorte = useCallback(porte => {
    setSelectedPorte(porte)
    setEditForm({
      statut: porte.statut,
      commentaire: porte.commentaire || '',
      rdvDate: porte.rdvDate ? porte.rdvDate.split('T')[0] : '',
      rdvTime: porte.rdvTime || '',
      nomPersonnalise: porte.nomPersonnalise || '',
      nbContrats: porte.nbContrats || 1,
    })
    setIsSaving(false)
    setShowEditModal(true)
  }, [])

  const handleSavePorte = useCallback(async () => {
    if (!selectedPorte || isSaving) return
    setIsSaving(true)

    const updateData = {
      id: selectedPorte.id,
      statut: editForm.statut,
      commentaire: editForm.commentaire.trim() || null,
      nomPersonnalise: editForm.nomPersonnalise.trim() || null,
      derniereVisite: new Date().toISOString(),
    }
    if (editForm.statut === 'RENDEZ_VOUS_PRIS') {
      if (editForm.rdvDate) updateData.rdvDate = editForm.rdvDate
      if (editForm.rdvTime) updateData.rdvTime = editForm.rdvTime
    }
    if (editForm.statut === 'CONTRAT_SIGNE') {
      updateData.nbContrats = editForm.nbContrats || 1
    }

    try {
      await updatePorte(updateData)
      
      // Mise à jour locale du cache pour éviter le rechargement complet de la liste
      updateLocalData(selectedPorte.id, updateData)
      
      // Rafraîchir les stats en arrière-plan (non bloquant pour l'UI)
      if (navigator.onLine && refetchStats) {
        refetchStats()
      }

      setShowEditModal(false)
      setSelectedPorte(null)
      showSuccess('Porte mise à jour avec succès !')
    } catch (error) {
      console.error('Error updating porte:', error)
      showError(error, 'Mise à jour porte')
      // Si erreur et on pense que c'est désynchronisé, on peut refetch
      if (navigator.onLine) await refetchPortes()
    } finally {
      setIsSaving(false)
    }
  }, [selectedPorte, isSaving, editForm, updatePorte, updateLocalData, refetchStats, refetchPortes, showSuccess, showError])

  const handleQuickStatusChange = useCallback(
    async (porte, newStatut, quickComment = '') => {
      const cleanedComment = quickComment ? quickComment.trim() : (porte.commentaire || '')

      // Special cases handling for modal opening
      if (newStatut === 'RENDEZ_VOUS_PRIS' || newStatut === 'CONTRAT_SIGNE') {
        setSelectedPorte(porte)
        setEditForm({
          statut: newStatut,
          commentaire: cleanedComment,
          rdvDate: newStatut === 'RENDEZ_VOUS_PRIS' ? new Date().toISOString().split('T')[0] : '',
          rdvTime: newStatut === 'RENDEZ_VOUS_PRIS' ? new Date().toTimeString().slice(0, 5) : '',
          nomPersonnalise: porte.nomPersonnalise || '',
          nbContrats: porte.nbContrats || 1,
        })
        setShowEditModal(true)
        return
      }

      // 1. Optimistic UI Update
      updateLocalData(porte.id, {
        statut: newStatut,
        commentaire: cleanedComment,
        derniereVisite: new Date().toISOString(),
      })

      const updateData = {
        id: porte.id,
        statut: newStatut,
        commentaire: cleanedComment,
        derniereVisite: new Date().toISOString(),
      }

      try {
        await updatePorte(updateData)
        if (navigator.onLine && refetchStats) {
          await refetchStats()
        }
      } catch (error) {
        showError(error, 'Mise à jour statut')
        if (navigator.onLine) await refetchPortes()
      }
    },
    [updatePorte, refetchPortes, refetchStats, updateLocalData, showSuccess, showError]
  )

  const handleRepassageChange = useCallback(
    async (porte, increment) => {
      const newNbRepassages = Math.max(0, (porte.nbRepassages || 0) + increment)
      const updateData = { id: porte.id, nbRepassages: newNbRepassages }

      updateLocalData(porte.id, { nbRepassages: newNbRepassages })
      if (selectedPorte && selectedPorte.id === porte.id) {
          setSelectedPorte(prev => ({ ...prev, nbRepassages: newNbRepassages }))
      }

      try {
        await updatePorte(updateData)
        if (navigator.onLine && refetchStats) {
          await refetchStats()
        }
      } catch (error) {
        console.error('Error updating repassages:', error)
        showError(error, 'Mise à jour repassages')
        if (navigator.onLine) await refetchPortes()
      }
    },
    [updatePorte, refetchPortes, refetchStats, showError, selectedPorte, updateLocalData]
  )
  
  const handleAddEtage = useCallback(async () => {
    if (!immeubleId || addingEtage) return
    setAddingEtage(true)
    try {
      await withScrollRestore(async () => {
        await addEtage(parseInt(immeubleId, 10))
        await Promise.all([refetchPortes(), refetchImmeuble()])
      })
      showSuccess('Étage ajouté avec succès !')
    } catch (error) {
      console.error('Error adding etage:', error)
      showError(error, 'Ajout étage')
    } finally {
      setAddingEtage(false)
    }
  }, [immeubleId, addingEtage, addEtage, refetchPortes, withScrollRestore, showSuccess, showError, refetchImmeuble])

  const handleAddPorteToEtage = useCallback(
    async etage => {
      if (!immeubleId || addingPorteToEtage) return
      setAddingPorteToEtage(true)
      try {
        await withScrollRestore(async () => {
          await addPorteToEtage({ immeubleId: parseInt(immeubleId, 10), etage })
          await Promise.all([refetchPortes(), refetchImmeuble()])
        })
        showSuccess('Porte ajoutée avec succès !')
      } catch (error) {
        console.error('Error adding porte to etage:', error)
        showError(error, 'Ajout porte')
      } finally {
        setAddingPorteToEtage(false)
      }
    },
    [immeubleId, addingPorteToEtage, addPorteToEtage, refetchPortes, withScrollRestore, showSuccess, showError, refetchImmeuble]
  )

  const handleRemoveEtage = useCallback(async (etage) => {
    if (!immeubleId) return
    try {
      await withScrollRestore(async () => {
        await removeEtage(parseInt(immeubleId, 10))
        await Promise.all([refetchPortes(), refetchImmeuble(), refetchStats()])
      })
      showSuccess(`Étage ${etage} supprimé avec succès !`)
    } catch (error) {
      console.error('Error removing etage:', error)
      showError(error, 'Suppression étage')
    }
  }, [immeubleId, removeEtage, refetchPortes, refetchImmeuble, refetchStats, withScrollRestore, showSuccess, showError])

  const handleRemovePorteFromEtage = useCallback(
    async (etage) => {
      if (!immeubleId) return
      try {
        await withScrollRestore(async () => {
          await removePorteFromEtage({ immeubleId: parseInt(immeubleId, 10), etage })
          await Promise.all([refetchPortes(), refetchImmeuble(), refetchStats()])
        })
        showSuccess('Porte supprimée avec succès !')
      } catch (error) {
        console.error('Error removing porte from etage:', error)
        showError(error, 'Suppression porte')
      }
    },
    [immeubleId, removePorteFromEtage, refetchPortes, refetchImmeuble, refetchStats, withScrollRestore, showSuccess, showError]
  )

  const handleBackToImmeubles = useCallback(() => {
    navigate('/immeubles')
  }, [navigate])

  const handleOpenEditModalFromRapide = useCallback((porte, presetStatut, quickComment = '') => {
      setSelectedPorte(porte)
      setEditForm({
        statut: presetStatut,
        commentaire: quickComment || porte.commentaire || '',
        rdvDate: presetStatut === 'RENDEZ_VOUS_PRIS' ? new Date().toISOString().split('T')[0] : '',
        rdvTime: presetStatut === 'RENDEZ_VOUS_PRIS' ? new Date().toTimeString().slice(0, 5) : '',
        nomPersonnalise: porte.nomPersonnalise || '',
        nbContrats: porte.nbContrats || 1,
      })
      setShowEditModal(true)
  }, [])
  
  return {
    state: {
      portes,
      statsData,
      loading: portesLoading,
      loadingImmeuble: immeubleLoading,
      immeuble,
      immeubleId,
      isFetchingMore,
      selectedFloor,
      viewMode,
      showEditModal,
      selectedPorte,
      editForm,
      isSaving,
      showQuitConfirm,
      addingEtage,
      addingPorteToEtage,
      statutOptions,
      loadMore,
      hasMore,
    },
    actions: {
      setViewMode,
      setEditForm,
      setShowEditModal,
      setShowQuitConfirm,
      setIsSaving,
      handleFloorSelect,
      handleEditPorte,
      handleSavePorte,
      handleQuickStatusChange,
      handleRepassageChange,
      handleAddEtage,
      handleAddPorteToEtage,
      handleRemoveEtage,
      handleRemovePorteFromEtage,
      handleBackToImmeubles,
      handleOpenEditModalFromRapide,
    }
  }
}
