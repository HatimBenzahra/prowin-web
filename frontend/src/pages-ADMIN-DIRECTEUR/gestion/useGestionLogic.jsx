import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRole } from '@/contexts/userole'
import {
  useDirecteursQuery,
  useManagersQuery,
  useCommercialsQuery,
  useUpdateManagerMutation,
  useUpdateCommercialMutation,
} from '@/hooks/metier/react-query'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { UserStatus } from '@/constants/domain/user-status'

// Identifiant de la zone de dépôt « Non assignés » (désassignation).
export const UNASSIGN_DROPZONE_ID = 'dropzone-unassigned'

/**
 * Parse la cible d'un drop et renvoie { type, id } normalisé.
 * Formats gérés :
 *  - "directeur-5" / "manager-3" / "commercial-7"  (drop sur une carte)
 *  - "dropzone-manager-5"          → directeur 5   (manager déposé sur directeur)
 *  - "dropzone-commercial-3"       → manager 3     (commercial déposé sur manager)
 *  - "dropzone-direct-commercial-5"→ directeur 5   (commercial direct)
 *  - "dropzone-unassigned"         → { type: 'unassign' }
 */
function parseDropTarget(overId) {
  if (overId === UNASSIGN_DROPZONE_ID) return { type: 'unassign', id: null }

  if (overId.startsWith('dropzone-')) {
    const parts = overId.split('-')
    if (parts[1] === 'direct') return { type: 'directeur', id: parseInt(parts[3], 10) }
    if (parts[1] === 'manager') return { type: 'directeur', id: parseInt(parts[2], 10) }
    if (parts[1] === 'commercial') return { type: 'manager', id: parseInt(parts[2], 10) }
    return { type: null, id: null }
  }

  const [type, idStr] = overId.split('-')
  return { type, id: parseInt(idStr, 10) }
}

function parseDraggable(activeId) {
  const [type, idStr] = activeId.split('-')
  return { type, id: parseInt(idStr, 10) }
}

export function useGestionLogic() {
  const { isAdmin, isDirecteur, currentUserId } = useRole()
  const { showError, showSuccess } = useErrorToast()

  // Récupérer les données avec React Query
  const {
    data: directeurs = [],
    isLoading: loadingDirecteurs,
    error: errorDirecteurs,
    refetch: refetchDirecteurs,
  } = useDirecteursQuery()

  const {
    data: managers = [],
    isLoading: loadingManagers,
    error: errorManagers,
    refetch: refetchManagers,
  } = useManagersQuery()

  const {
    data: commercials = [],
    isLoading: loadingCommercials,
    error: errorCommercials,
    refetch: refetchCommercials,
  } = useCommercialsQuery()

  // Mutations avec optimistic updates
  const { mutate: updateManager } = useUpdateManagerMutation()
  const { mutate: updateCommercial } = useUpdateCommercialMutation()

  // État local
  const [activeId, setActiveId] = useState(null)
  const [statusFilter, setStatusFilter] = useState(UserStatus.ACTIF)
  const [searchQuery, setSearchQuery] = useState('')
  const [addModal, setAddModal] = useState({
    isOpen: false,
    userType: null,
    parentId: null,
    parentType: null,
  })
  const [reassignModal, setReassignModal] = useState({
    isOpen: false,
    userType: null,
    user: null,
  })

  // Sélection master-détail : directeur → manager (ou 'direct') → commerciaux
  const [selectedDirecteurId, setSelectedDirecteurId] = useState(null)
  const [selectedManagerId, setSelectedManagerId] = useState(null)

  // Le filtre par statut (Actifs / Utilisateurs test) est réservé aux admins.
  const showStatusFilter = isAdmin

  const statusFilterOptions = useMemo(
    () => [
      { value: UserStatus.ACTIF, label: 'Actifs' },
      { value: UserStatus.CONTRAT_FINIE, label: 'Contrat fini' },
      { value: UserStatus.UTILISATEUR_TEST, label: 'Utilisateurs test' },
    ],
    []
  )

  // Configuration des sensors pour le drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px de mouvement avant de commencer le drag (plus sensible)
      },
    })
  )

  const matchesStatusFilter = useCallback(
    status => {
      if (!status) return false
      // Seuls les admins basculent le filtre ; les autres ne voient que les actifs.
      return status === (showStatusFilter ? statusFilter : UserStatus.ACTIF)
    },
    [statusFilter, showStatusFilter]
  )

  const filteredManagers = useMemo(
    () => managers.filter(manager => matchesStatusFilter(manager.status)),
    [managers, matchesStatusFilter]
  )

  const filteredDirecteurs = useMemo(
    () => directeurs.filter(directeur => matchesStatusFilter(directeur.status)),
    [directeurs, matchesStatusFilter]
  )

  const filteredCommercials = useMemo(
    () => commercials.filter(commercial => matchesStatusFilter(commercial.status)),
    [commercials, matchesStatusFilter]
  )

  const filteredDirecteurIds = useMemo(
    () => new Set(filteredDirecteurs.map(directeur => directeur.id)),
    [filteredDirecteurs]
  )

  const filteredManagerIds = useMemo(
    () => new Set(filteredManagers.map(manager => manager.id)),
    [filteredManagers]
  )

  // Construire la structure hiérarchique
  const organizationData = useMemo(() => {
    if (!filteredDirecteurs || !filteredManagers || !filteredCommercials)
      return { trees: [], unassigned: { managers: [], commercials: [] } }

    // Créer les arbres pour chaque directeur
    const trees = filteredDirecteurs.map(directeur => ({
      ...directeur,
      type: 'directeur',
      managers: filteredManagers
        .filter(m => m.directeurId === directeur.id)
        .map(manager => ({
          ...manager,
          type: 'manager',
          commercials: filteredCommercials
            .filter(c => c.managerId === manager.id)
            .map(commercial => ({
              ...commercial,
              type: 'commercial',
            })),
        })),
      // Commerciaux directs (sans manager)
      directCommercials: filteredCommercials
        .filter(
          c =>
            c.directeurId === directeur.id && (!c.managerId || !filteredManagerIds.has(c.managerId))
        )
        .map(commercial => ({
          ...commercial,
          type: 'commercial',
        })),
    }))

    // Trouver les utilisateurs non assignés
    const unassignedManagers = filteredManagers
      .filter(m => !m.directeurId || !filteredDirecteurIds.has(m.directeurId))
      .map(m => ({ ...m, type: 'manager' }))

    const unassignedCommercials = filteredCommercials
      .filter(c => !c.directeurId || !filteredDirecteurIds.has(c.directeurId))
      .map(c => ({ ...c, type: 'commercial' }))

    return {
      trees,
      unassigned: {
        managers: unassignedManagers,
        commercials: unassignedCommercials,
      },
    }
  }, [
    filteredDirecteurs,
    filteredManagers,
    filteredCommercials,
    filteredDirecteurIds,
    filteredManagerIds,
  ])

  // Filtrage par recherche : garde les correspondances + leurs parents (contexte).
  const organizationView = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return organizationData

    const matchUser = user =>
      `${user.prenom ?? ''} ${user.nom ?? ''} ${user.email ?? ''}`.toLowerCase().includes(query)

    const trees = organizationData.trees
      .map(directeur => {
        const directeurMatches = matchUser(directeur)

        const managersView = directeur.managers
          .map(manager => {
            const managerMatches = matchUser(manager)
            const commercials =
              directeurMatches || managerMatches
                ? manager.commercials
                : manager.commercials.filter(matchUser)
            return { manager, managerMatches, commercials }
          })
          .filter(
            ({ managerMatches, commercials }) =>
              directeurMatches || managerMatches || commercials.length > 0
          )
          .map(({ manager, commercials }) => ({ ...manager, commercials }))

        const directCommercials = directeurMatches
          ? directeur.directCommercials
          : directeur.directCommercials.filter(matchUser)

        return { directeur, directeurMatches, managersView, directCommercials }
      })
      .filter(
        ({ directeurMatches, managersView, directCommercials }) =>
          directeurMatches || managersView.length > 0 || directCommercials.length > 0
      )
      .map(({ directeur, managersView, directCommercials }) => ({
        ...directeur,
        managers: managersView,
        directCommercials,
      }))

    return {
      trees,
      unassigned: {
        managers: organizationData.unassigned.managers.filter(matchUser),
        commercials: organizationData.unassigned.commercials.filter(matchUser),
      },
    }
  }, [organizationData, searchQuery])

  // Compteurs récapitulatifs (sur les données filtrées par statut, hors recherche)
  const counts = useMemo(
    () => ({
      directeurs: filteredDirecteurs.length,
      managers: filteredManagers.length,
      commercials: filteredCommercials.length,
      unassigned:
        organizationData.unassigned.managers.length +
        organizationData.unassigned.commercials.length,
    }),
    [filteredDirecteurs, filteredManagers, filteredCommercials, organizationData]
  )

  // Arbres visibles selon les permissions (un directeur ne voit que le sien)
  const visibleTrees = useMemo(
    () =>
      isDirecteur
        ? organizationView.trees.filter(t => t.id === parseInt(currentUserId, 10))
        : organizationView.trees,
    [organizationView.trees, isDirecteur, currentUserId]
  )

  // Valider / auto-sélectionner le directeur courant
  useEffect(() => {
    if (!visibleTrees.length) {
      if (selectedDirecteurId !== null) setSelectedDirecteurId(null)
      return
    }
    if (!visibleTrees.some(t => t.id === selectedDirecteurId)) {
      setSelectedDirecteurId(visibleTrees[0].id)
    }
  }, [visibleTrees, selectedDirecteurId])

  const selectedDirecteur = useMemo(
    () => visibleTrees.find(t => t.id === selectedDirecteurId) || null,
    [visibleTrees, selectedDirecteurId]
  )

  // Valider / auto-sélectionner le manager (ou le groupe « commerciaux directs »)
  useEffect(() => {
    if (!selectedDirecteur) return
    const managerIds = selectedDirecteur.managers.map(m => m.id)
    const hasDirect = (selectedDirecteur.directCommercials?.length ?? 0) > 0
    const valid =
      (selectedManagerId === 'direct' && hasDirect) ||
      (typeof selectedManagerId === 'number' && managerIds.includes(selectedManagerId))
    if (!valid) {
      setSelectedManagerId(managerIds.length ? managerIds[0] : hasDirect ? 'direct' : null)
    }
  }, [selectedDirecteur, selectedManagerId])

  // Colonnes dérivées
  const columnManagers = selectedDirecteur?.managers ?? []
  const columnHasDirect = (selectedDirecteur?.directCommercials?.length ?? 0) > 0
  const columnCommercials = useMemo(() => {
    if (!selectedDirecteur) return []
    if (selectedManagerId === 'direct') return selectedDirecteur.directCommercials ?? []
    const manager = selectedDirecteur.managers.find(m => m.id === selectedManagerId)
    return manager?.commercials ?? []
  }, [selectedDirecteur, selectedManagerId])

  const selectDirecteur = useCallback(id => {
    setSelectedDirecteurId(id)
    setSelectedManagerId(null) // sera auto-résolu par l'effet
  }, [])

  const selectManager = useCallback(id => setSelectedManagerId(id), [])

  // Trouver un utilisateur par ID et type
  const findUser = useCallback(
    (id, type) => {
      const idNum = parseInt(id)
      switch (type) {
        case 'directeur':
          return filteredDirecteurs?.find(d => d.id === idNum)
        case 'manager':
          return filteredManagers?.find(m => m.id === idNum)
        case 'commercial':
          return filteredCommercials?.find(c => c.id === idNum)
        default:
          return null
      }
    },
    [filteredDirecteurs, filteredManagers, filteredCommercials]
  )

  // Désassignation : ramener un utilisateur vers « Non assignés »
  const unassignCommercial = useCallback(
    commercialId => {
      updateCommercial(
        { id: commercialId, managerId: null, directeurId: null },
        { onSuccess: () => showSuccess('Commercial désassigné') }
      )
    },
    [updateCommercial, showSuccess]
  )

  const unassignManager = useCallback(
    managerId => {
      // On détache le manager de son directeur ; son équipe reste rattachée au manager.
      updateManager(
        { id: managerId, directeurId: null },
        { onSuccess: () => showSuccess('Manager désassigné') }
      )
    },
    [updateManager, showSuccess]
  )

  const unassignUser = useCallback(
    (type, id) => {
      if (type === 'commercial') unassignCommercial(id)
      else if (type === 'manager') unassignManager(id)
    },
    [unassignCommercial, unassignManager]
  )

  // Réassignation via le menu d'action (cibles arbitraires, hors colonnes visibles).
  // `null` = « Aucun » (désassignation partielle).
  const reassignCommercial = useCallback(
    (id, { directeurId, managerId }) => {
      updateCommercial(
        { id, directeurId, managerId },
        { onSuccess: () => showSuccess('Commercial réassigné') }
      )
    },
    [updateCommercial, showSuccess]
  )

  const reassignManager = useCallback(
    (id, { directeurId }) => {
      updateManager({ id, directeurId }, { onSuccess: () => showSuccess('Manager réassigné') })
    },
    [updateManager, showSuccess]
  )

  const openReassign = useCallback((userType, user) => {
    setReassignModal({ isOpen: true, userType, user })
  }, [])

  const closeReassign = useCallback(() => {
    setReassignModal(prev => ({ ...prev, isOpen: false }))
  }, [])

  // Gérer le début du drag
  const handleDragStart = event => {
    setActiveId(event.active.id)
  }

  // Gérer le drop
  const handleDragEnd = async event => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    try {
      const { type: activeType, id: activeUserId } = parseDraggable(active.id)
      const { type: overType, id: overUserId } = parseDropTarget(over.id)

      // Désassignation : dépôt sur le panneau « Non assignés »
      if (overType === 'unassign') {
        unassignUser(activeType, activeUserId)
        return
      }

      // Règles de déplacement:
      // 1. Commercial peut être déplacé vers Manager ou Directeur
      // 2. Manager peut SEULEMENT être déplacé vers Directeur
      // 3. Directeur ne peut pas être déplacé

      if (activeType === 'commercial') {
        if (overType === 'manager') {
          // Assigner commercial à un manager (optimistic update React Query).
          updateCommercial(
            { id: activeUserId, managerId: overUserId },
            { onSuccess: () => showSuccess('Commercial assigné au manager avec succès') }
          )
        } else if (overType === 'directeur') {
          // Assigner commercial directement à un directeur (sans manager)
          updateCommercial(
            { id: activeUserId, directeurId: overUserId, managerId: null },
            { onSuccess: () => showSuccess('Commercial assigné au directeur avec succès') }
          )
        }
      } else if (activeType === 'manager') {
        if (overType === 'directeur') {
          // Avant de déplacer le manager, récupérer tous ses commerciaux
          const managerCommercials = commercials?.filter(c => c.managerId === activeUserId)

          // Mettre à jour le directeur du manager
          updateManager(
            { id: activeUserId, directeurId: overUserId },
            {
              onSuccess: () => {
                // Détacher les commerciaux du manager (ils deviennent directs mais
                // restent visibles sous le directeur).
                if (managerCommercials && managerCommercials.length > 0) {
                  managerCommercials.forEach(commercial => {
                    updateCommercial({
                      id: commercial.id,
                      managerId: null,
                      directeurId: commercial.directeurId || null,
                    })
                  })
                }
                showSuccess('Manager assigné au directeur avec succès')
              },
            }
          )
        } else {
          showError(
            new Error("Un manager ne peut être assigné qu'à un directeur"),
            'Gestion.handleDragEnd'
          )
          return
        }
      }
    } catch (error) {
      showError(error, 'Gestion.handleDragEnd')
    }
  }

  // Création d'utilisateurs
  const openAddModal = useCallback((userType, parentId = null, parentType = null) => {
    setAddModal({ isOpen: true, userType, parentId, parentType })
  }, [])

  const closeAddModal = useCallback(() => {
    setAddModal(prev => ({ ...prev, isOpen: false }))
  }, [])

  const loading = loadingDirecteurs || loadingManagers || loadingCommercials
  const error = errorDirecteurs?.message || errorManagers?.message || errorCommercials?.message

  const refetchAll = useCallback(() => {
    refetchDirecteurs()
    refetchManagers()
    refetchCommercials()
  }, [refetchDirecteurs, refetchManagers, refetchCommercials])

  // Après création : le cache React Query est déjà invalidé par la mutation ;
  // on ferme le modal et on force un refetch pour un affichage immédiat.
  const handleAddSuccess = useCallback(() => {
    closeAddModal()
    refetchAll()
  }, [closeAddModal, refetchAll])

  return {
    isAdmin,
    isDirecteur,
    currentUserId,
    loading,
    error,
    organizationData: organizationView,
    counts,
    sensors,
    activeId,
    findUser,
    handleDragStart,
    handleDragEnd,
    refetchAll,
    // Recherche
    searchQuery,
    setSearchQuery,
    // Filtre statut
    statusFilter,
    setStatusFilter,
    statusFilterOptions,
    showStatusFilter,
    // Sélection master-détail
    visibleTrees,
    selectedDirecteurId,
    selectedDirecteur,
    selectDirecteur,
    selectedManagerId,
    selectManager,
    columnManagers,
    columnHasDirect,
    columnCommercials,
    // Désassignation
    unassignUser,
    // Réassignation
    reassignModal,
    openReassign,
    closeReassign,
    reassignCommercial,
    reassignManager,
    // Création
    directeurs,
    managers,
    addModal,
    openAddModal,
    closeAddModal,
    handleAddSuccess,
  }
}
