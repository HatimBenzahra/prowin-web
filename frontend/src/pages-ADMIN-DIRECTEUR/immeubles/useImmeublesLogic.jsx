import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  useImmeubles,
  useUpdateImmeuble,
  useRemoveImmeuble,
  useCommercials,
  useManagers,
  useQuartiers,
} from '@/services'
import {
  useEntityPermissions,
  useEntityDescription,
} from '@/hooks/metier/permissions/useRoleBasedData'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { Badge } from '@/components/ui/badge'
import { BuildingTypeBadge } from '@/components/BuildingTypeBadge'
import { habitatBreakdown, buildingDoorCount } from '@/constants/domain/habitat'
import { UserStatus } from '@/constants/domain/user-status'
import {
  couvertureBarClass,
  filterByAddress,
  sortCardRows,
  groupRowsByDate,
  CARD_SORT_OPTIONS,
} from './immeubles-display'

// Valeur de filtre/groupe pour les bâtiments sans quartier
export const AUTONOMES_KEY = 'autonomes'

function calculnbcontrats(immeuble) {
  return (immeuble.portes || [])
    .filter(p => p.statut === 'CONTRAT_SIGNE')
    .reduce((sum, p) => sum + (p.nbContrats || 1), 0)
}

export function useImmeublesLogic() {
  const { showError, showSuccess } = useErrorToast()
  const [viewMode, setViewMode] = useState('cards')
  const [cardSearch, setCardSearch] = useState('')
  const [cardSort, setCardSort] = useState(CARD_SORT_OPTIONS[0].value)
  // Par défaut on regarde ce qui vient d'être créé : c'est ce qui met la journée en
  // cours en tête du groupement par date.
  const [dateFilterMode, setDateFilterMode] = useState('createdAt_desc')
  const [filterCommercial, setFilterCommercial] = useState('all')
  const [filterQuartier, setFilterQuartier] = useState('all')
  const [filterOwnerStatus, setFilterOwnerStatus] = useState(UserStatus.ACTIF)
  const [createdDate, setCreatedDate] = useState('')

  // API hooks
  const { data: immeublesApi, loading: immeublesLoading, refetch } = useImmeubles()
  const { data: commercials } = useCommercials()
  const { data: managers } = useManagers()
  const { data: quartiers } = useQuartiers()
  const { mutate: updateImmeuble } = useUpdateImmeuble()
  const { mutate: removeImmeuble } = useRemoveImmeuble()

  const quartierNameById = useMemo(() => {
    const map = new Map()
    ;(quartiers || []).forEach(q => map.set(q.id, q.nom))
    return map
  }, [quartiers])

  /**
   * Statut du propriétaire d'un bâtiment, indexé par type et identifiant.
   * `GET_IMMEUBLES` n'expose pas de créateur : on se rabat sur le commercial
   * rattaché, puis sur le manager.
   */
  const ownerStatusByKey = useMemo(() => {
    const map = new Map()
    ;(commercials || []).forEach(c => map.set(`COMMERCIAL-${Number(c.id)}`, c.status))
    ;(managers || []).forEach(m => map.set(`MANAGER-${Number(m.id)}`, m.status))
    return map
  }, [commercials, managers])

  const ownerStatusOf = useCallback(
    immeuble => {
      if (immeuble?.commercialId != null) {
        return ownerStatusByKey.get(`COMMERCIAL-${Number(immeuble.commercialId)}`) ?? null
      }
      if (immeuble?.managerId != null) {
        return ownerStatusByKey.get(`MANAGER-${Number(immeuble.managerId)}`) ?? null
      }
      return null
    },
    [ownerStatusByKey]
  )

  /** Le filtre commerciaux suit le statut choisi : il ne propose que ce que ce statut laisse voir. */
  const commercialsForStatus = useMemo(
    () =>
      filterOwnerStatus === 'all'
        ? commercials || []
        : (commercials || []).filter(c => c.status === filterOwnerStatus),
    [commercials, filterOwnerStatus]
  )

  // Un commercial sélectionné qui sort du statut choisi ne doit pas vider la liste en silence.
  useEffect(() => {
    if (
      filterCommercial !== 'all' &&
      commercials &&
      !commercialsForStatus.some(c => String(c.id) === String(filterCommercial))
    ) {
      setFilterCommercial('all')
    }
  }, [filterCommercial, commercials, commercialsForStatus])

  /** Champ de date qui gouverne à la fois le tri et le groupement par journée. */
  const activeDateField = useMemo(
    () => (dateFilterMode.startsWith('updatedAt') ? 'updatedAt' : 'createdAt'),
    [dateFilterMode]
  )

  useEffect(() => {
    if (dateFilterMode !== 'created_specific_date' && createdDate) {
      setCreatedDate('')
    }
  }, [dateFilterMode, createdDate])

  const effectiveSortBy = useMemo(() => {
    if (
      dateFilterMode === 'createdAt_desc' ||
      dateFilterMode === 'createdAt_asc' ||
      dateFilterMode === 'updatedAt_desc' ||
      dateFilterMode === 'updatedAt_asc'
    ) {
      return dateFilterMode
    }
    return 'createdAt_desc'
  }, [dateFilterMode])

  const filteredImmeubles = useMemo(() => {
    let result = immeublesApi || []

    // Filtre le plus en amont : les KPI, le groupement et les deux vues en héritent.
    // Un bâtiment sans propriétaire n'a pas de statut déterminable, il est donc écarté
    // dès qu'un statut précis est demandé, et ne réapparaît que sur « Tous ».
    if (filterOwnerStatus !== 'all') {
      result = result.filter(imm => ownerStatusOf(imm) === filterOwnerStatus)
    }

    if (filterCommercial !== 'all') {
      result = result.filter(imm => imm.commercialId === parseInt(filterCommercial))
    }

    if (filterQuartier !== 'all') {
      if (filterQuartier === AUTONOMES_KEY) {
        result = result.filter(imm => imm.quartierId == null)
      } else {
        result = result.filter(imm => imm.quartierId === parseInt(filterQuartier))
      }
    }

    if (dateFilterMode === 'created_yesterday') {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 1)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)

      result = result.filter(imm => {
        const createdAt = new Date(imm.createdAt)
        return createdAt >= startDate && createdAt <= endDate
      })
    }

    if (dateFilterMode === 'created_this_week') {
      const now = new Date()
      const day = now.getDay()
      const diffToMonday = (day + 6) % 7
      const startDate = new Date(now)
      startDate.setDate(now.getDate() - diffToMonday)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 6)
      endDate.setHours(23, 59, 59, 999)

      result = result.filter(imm => {
        const createdAt = new Date(imm.createdAt)
        return createdAt >= startDate && createdAt <= endDate
      })
    }

    if (dateFilterMode === 'created_specific_date' && createdDate) {
      const startDate = new Date(createdDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setHours(23, 59, 59, 999)

      result = result.filter(imm => {
        const createdAt = new Date(imm.createdAt)
        return createdAt >= startDate && createdAt <= endDate
      })
    }

    return result
  }, [
    immeublesApi,
    filterOwnerStatus,
    ownerStatusOf,
    filterCommercial,
    filterQuartier,
    dateFilterMode,
    createdDate,
  ])

  // Récupération des permissions et description
  const permissions = useEntityPermissions('immeubles')
  const description = useEntityDescription('immeubles')

  // Configuration des colonnes
  const immeublesColumns = useMemo(
    () => [
      {
        header: 'Adresse',
        accessor: 'address',
        sortable: true,
        className: 'font-medium max-w-[280px]',
        cell: row => (
          <div className="truncate">
            <span className="text-[13px] font-medium">{row.address}</span>
          </div>
        ),
      },
      {
        header: 'Type',
        accessor: 'typeHabitat',
        sortable: true,
        className: 'hidden lg:table-cell',
        cell: row => <BuildingTypeBadge immeuble={row} className="text-[10px]" />,
      },
      {
        header: 'Commercial',
        accessor: 'commercial_name',
        sortable: true,
        className: 'hidden xl:table-cell text-[13px]',
      },
      {
        header: 'Quartier',
        accessor: 'quartier_name',
        sortable: true,
        className: 'hidden lg:table-cell text-[13px]',
        cell: row => (
          <span className={row.quartierId == null ? 'text-muted-foreground' : ''}>
            {row.quartier_name}
          </span>
        ),
      },
      {
        header: 'Ét.',
        accessor: 'floors',
        sortable: true,
        className: 'hidden md:table-cell tabular-nums text-[13px] text-center',
      },
      {
        header: 'Portes',
        accessor: 'total_doors',
        sortable: true,
        className: 'hidden md:table-cell tabular-nums text-[13px] text-center',
      },
      {
        header: 'Contrats',
        accessor: 'contrats_signes',
        sortable: true,
        className: 'hidden md:table-cell text-center',
        cell: row => (
          <span
            className={`tabular-nums text-[13px] font-medium ${row.contrats_signes > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}
          >
            {row.contrats_signes > 0 && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />
            )}
            {row.contrats_signes}
          </span>
        ),
      },
      {
        header: 'RDV',
        accessor: 'rdvCount',
        sortable: true,
        className: 'hidden lg:table-cell text-center',
        cell: row =>
          row.rdvCount > 0 ? (
            <Badge className="text-[10px] bg-blue-100 text-blue-800">{row.rdvCount}</Badge>
          ) : (
            <span className="text-[13px] text-muted-foreground">—</span>
          ),
      },
      {
        header: 'Non visités',
        accessor: 'nonVisiteCount',
        sortable: true,
        className: 'hidden xl:table-cell text-center',
        cell: row => (
          <span
            className={`tabular-nums text-[13px] ${row.nonVisiteCount === 0 ? 'text-muted-foreground' : 'font-medium'}`}
          >
            {row.nonVisiteCount}
          </span>
        ),
      },
      {
        header: 'Couverture',
        accessor: 'couverture',
        sortable: true,
        className: 'hidden lg:table-cell',
        cell: row => (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${couvertureBarClass(row.couverture)}`}
                style={{ width: `${row.couverture}%` }}
              />
            </div>
            <span className="tabular-nums text-[12px] text-muted-foreground w-9 text-right">
              {row.couverture}%
            </span>
          </div>
        ),
      },
      {
        header: 'Créé le',
        accessor: 'createdAt',
        sortable: true,
        className: 'hidden xl:table-cell text-[12px] tabular-nums text-muted-foreground',
        cell: row => new Date(row.createdAt).toLocaleDateString('fr-FR'),
      },
    ],
    []
  )

  // Configuration des champs d'édition
  const getImmeublesEditFields = useMemo(
    () => [
      {
        key: 'address',
        label: 'Adresse',
        type: 'textarea',
        required: true,
        section: 'Informations générales',
        fullWidth: true,
        placeholder: 'Adresse complète du bâtiment',
      },
      {
        key: 'floors',
        label: "Nombre d'étages",
        type: 'number',
        required: true,
        section: 'Caractéristiques',
        min: 1,
        max: 100,
      },
      {
        key: 'doors_per_floor',
        label: 'Portes par étage',
        type: 'number',
        required: true,
        section: 'Caractéristiques',
        min: 1,
        max: 100,
      },
      {
        key: 'commercial_name',
        label: 'Commercial responsable',
        type: 'select',
        required: true,
        section: 'Gestion',
        options: (commercials || []).map(c => ({
          value: `${c.prenom} ${c.nom}`,
          label: `${c.prenom} ${c.nom}`,
        })),
      },
    ],
    [commercials]
  )

  const tableData = useMemo(() => {
    if (!filteredImmeubles) return []

    const [field, direction] = effectiveSortBy.split('_')
    const sortedImmeubles = [...filteredImmeubles].sort((a, b) => {
      const dateA = new Date(a[field]).getTime()
      const dateB = new Date(b[field]).getTime()
      return direction === 'desc' ? dateB - dateA : dateA - dateB
    })
    const mappedData = sortedImmeubles.map(immeuble => {
      const commercial = commercials?.find(c => c.id === immeuble.commercialId)
      const manager = managers?.find(m => m.id === immeuble.managerId)
      const portesImmeuble = immeuble.portes || []
      // Total de portes PRÉVUES (grille déclarée) — jamais le nombre de portes créées.
      const totalDoors = buildingDoorCount(immeuble)
      const portesProspectees = portesImmeuble.filter(p => p.statut !== 'NON_VISITE').length
      const couverture =
        totalDoors > 0 ? parseFloat(((portesProspectees / totalDoors) * 100).toFixed(1)) : 0

      // Déterminer le nom du responsable
      let responsibleName = 'N/A'
      if (commercial) {
        responsibleName = `${commercial.prenom} ${commercial.nom}`
      } else if (manager) {
        responsibleName = `${manager.prenom} ${manager.nom} (Manager)`
      }

      const rdvCount = portesImmeuble.filter(p => p.statut === 'RENDEZ_VOUS_PRIS').length
      const nonVisiteCount = portesImmeuble.filter(p => p.statut === 'NON_VISITE').length
      const quartierName =
        immeuble.quartierId != null
          ? quartierNameById.get(immeuble.quartierId) || 'Quartier inconnu'
          : 'Autonome'

      return {
        ...immeuble,
        address: immeuble.adresse,
        floors: immeuble.nbEtages,
        doors_per_floor: immeuble.nbPortesParEtage,
        total_doors: totalDoors,
        contrats_signes: calculnbcontrats(immeuble),
        couverture: couverture,
        rdvCount,
        nonVisiteCount,
        commercial_name: responsibleName,
        quartier_name: quartierName,
      }
    })

    const totalImmeubles = sortedImmeubles.length
    const totalContrats = sortedImmeubles.reduce((acc, curr) => acc + calculnbcontrats(curr), 0)
    const avgCouverture =
      totalImmeubles > 0
        ? (
            sortedImmeubles.reduce((acc, curr) => {
              const portesImmeuble = curr.portes || []
              const totalDoors = buildingDoorCount(curr)
              const portesProspectees = portesImmeuble.filter(p => p.statut !== 'NON_VISITE').length
              const couverture = totalDoors > 0 ? (portesProspectees / totalDoors) * 100 : 0
              return acc + couverture
            }, 0) / totalImmeubles
          ).toFixed(1)
        : 0

    const totalRdv = mappedData.reduce((acc, curr) => acc + curr.rdvCount, 0)
    const totalNonVisites = mappedData.reduce((acc, curr) => acc + curr.nonVisiteCount, 0)
    const typeBreakdown = habitatBreakdown(sortedImmeubles)

    return {
      data: mappedData,
      stats: {
        totalImmeubles,
        totalContrats,
        avgCouverture,
        totalRdv,
        totalNonVisites,
        typeBreakdown,
      },
    }
  }, [filteredImmeubles, commercials, managers, quartierNameById, effectiveSortBy])

  const stats = tableData?.stats || {
    totalImmeubles: 0,
    totalContrats: 0,
    avgCouverture: 0,
    totalRdv: 0,
    totalNonVisites: 0,
    typeBreakdown: { total: 0, IMMEUBLE: 0, MAISON: 0, PAVILLON: 0 },
  }
  const finalTableData = useMemo(() => tableData?.data || [], [tableData])

  // Vue cards : recherche sur l'adresse et tri propres à cette vue. Le tableau garde
  // sa recherche et son tri par colonne, on n'en duplique donc pas les contrôles.
  const cardsData = useMemo(
    () => sortCardRows(filterByAddress(finalTableData, cardSearch), cardSort),
    [finalTableData, cardSearch, cardSort]
  )

  // Les cards sont regroupées par journée sur le champ de date actif : l'ordre des
  // groupes suit celui des lignes, donc la direction choisie dans le select de date.
  const cardsGroupedByDate = useMemo(
    () => groupRowsByDate(cardsData, activeDateField),
    [cardsData, activeDateField]
  )

  const handleEditImmeuble = async editedData => {
    try {
      const commercial = commercials?.find(
        c => `${c.prenom} ${c.nom}` === editedData.commercial_name
      )

      const updateInput = {
        id: editedData.id,
        adresse: editedData.address,
        nbEtages: parseInt(editedData.floors),
        nbPortesParEtage: parseInt(editedData.doors_per_floor),
        commercialId: commercial?.id,
      }

      await updateImmeuble(updateInput)
      await refetch()
      showSuccess('Bâtiment modifié avec succès')
    } catch (error) {
      showError(error, 'Immeubles.handleEditImmeuble')
      throw error
    }
  }

  const handleDeleteImmeuble = async id => {
    try {
      await removeImmeuble(id)
      await refetch()
      showSuccess('Bâtiment supprimé avec succès')
    } catch (error) {
      showError(error, 'Immeubles.handleDeleteImmeuble')
      throw error
    }
  }

  return {
    viewMode,
    setViewMode,
    immeublesLoading,
    description,
    tableData: finalTableData,
    stats,
    immeublesColumns,
    getImmeublesEditFields,
    permissions,
    handleEditImmeuble,
    handleDeleteImmeuble,
    filteredImmeubles,
    filterCommercial,
    setFilterCommercial,
    filterQuartier,
    setFilterQuartier,
    cardsData,
    cardsGroupedByDate,
    filterOwnerStatus,
    setFilterOwnerStatus,
    cardSearch,
    setCardSearch,
    cardSort,
    setCardSort,
    dateFilterMode,
    setDateFilterMode,
    createdDate,
    setCreatedDate,
    commercialsList: commercialsForStatus,
    quartiersList: quartiers,
  }
}
