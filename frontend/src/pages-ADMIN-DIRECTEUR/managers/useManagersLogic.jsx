import { useMemo } from 'react'
import {
  useManagers,
  useUpdateManager,
  useDirecteurs,
  useTeamLastStatusActivities,
} from '@/services'
import { useEntityPage } from '@/hooks/metier/permissions/useRoleBasedData'
import { useRole } from '@/contexts/userole'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import {
  USER_STATUS_CONFIG,
  UserStatus,
  getStatusFilterOptions,
} from '@/constants/domain/user-status'
import { useStatusBadge } from '@/hooks/utils/ui/useStatusBadge'
import { useRanking } from '@/hooks/metier/api/gamification'
import { currentMonthlyPeriodKey, indexRankingByUser, toRankInfo } from '@/lib/rank-wps'

const getActivityTime = activity => {
  if (!activity?.changedAt) return 0
  const time = new Date(activity.changedAt).getTime()
  return Number.isFinite(time) ? time : 0
}

const formatRelativeActivityDate = dateValue => {
  if (!dateValue) return 'Jamais'

  const date = new Date(dateValue)
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return 'Date inconnue'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'À l’instant'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} j`

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const renderActivityCell = row => {
  if (!row.lastActivity) {
    return <span className="text-xs text-muted-foreground">Jamais</span>
  }

  return (
    <div className="min-w-28">
      <p className="text-sm font-medium">
        {formatRelativeActivityDate(row.lastActivity.changedAt)}
      </p>
    </div>
  )
}

const getManagersColumns = renderStatusBadge => {
  const baseColumns = [
    {
      header: 'Nom',
      accessor: 'nom',
      sortable: true,
      className: 'font-medium',
    },
    {
      header: 'Prénom',
      accessor: 'prenom',
      sortable: true,
      className: 'font-medium',
    },
    {
      header: 'Statut',
      accessor: 'status',
      sortable: true,
      className: 'hidden md:table-cell',
      cell: row => renderStatusBadge(row.status),
    },
    {
      header: 'Dernier terrain',
      accessor: 'lastActivityLabel',
      sortKey: 'lastActivityAt',
      sortable: true,
      className: 'hidden md:table-cell',
      cell: renderActivityCell,
    },
    {
      header: 'Rang',
      accessor: 'rankBadge',
      sortKey: 'points',
      sortable: true,
      className: 'hidden sm:table-cell',
    },
    {
      header: 'Email',
      accessor: 'email',
      className: 'hidden sm:table-cell',
    },
    {
      header: 'Téléphone',
      accessor: 'numTelephone',
      className: 'hidden md:table-cell',
    },
    {
      header: 'Directeur',
      accessor: 'directeur',
      sortable: true,
      className: 'hidden lg:table-cell',
    },
  ]

  return baseColumns
}

export function useManagersLogic() {
  const { isAdmin } = useRole()
  const { showError, showSuccess } = useErrorToast()
  // API hooks
  const { data: managersApi, loading: managersLoading, refetch } = useManagers()
  const { data: directeurs } = useDirecteurs()
  const { data: lastStatusActivities, loading: lastActivitiesLoading } =
    useTeamLastStatusActivities()
  const { mutate: updateManager } = useUpdateManager()

  // Utilisation du système de rôles pour filtrer les données
  const {
    data: filteredManagers,
    permissions,
    description,
  } = useEntityPage('managers', managersApi || [])

  const { renderStatusBadge } = useStatusBadge()

  // Rang = classement mensuel WinLeadPlus (source de vérité), indexé par manager.
  const monthlyPeriodKey = useMemo(() => currentMonthlyPeriodKey(), [])
  const { data: monthlyRanking } = useRanking('MONTHLY', monthlyPeriodKey)
  const rankByManager = useMemo(
    () => indexRankingByUser(monthlyRanking).byManager,
    [monthlyRanking]
  )

  // Préparation des données pour le tableau avec mapping API -> UI
  const tableData = useMemo(() => {
    if (!filteredManagers) return []

    const activityByManager = new Map(
      (lastStatusActivities || [])
        .filter(activity => activity.userType === 'manager')
        .map(activity => [activity.userId, activity])
    )

    return filteredManagers
      .map(manager => {
        const directeur = directeurs?.find(d => d.id === manager.directeurId)
        const rankSnapshot = rankByManager.get(manager.id)
        const rankInfo = toRankInfo(rankSnapshot)
        const lastActivity = activityByManager.get(manager.id) || null
        const lastActivityAt = getActivityTime(lastActivity)

        return {
          ...manager,
          nom: manager.nom,
          prenom: manager.prenom,
          status: manager.status,
          email: manager.email || 'Non renseigné',
          numTelephone: manager.numTelephone || 'Non renseigné',
          directeur: directeur ? `${directeur.prenom} ${directeur.nom}` : 'Aucun directeur',
          lastActivity,
          lastActivityAt,
          lastActivityLabel: formatRelativeActivityDate(lastActivity?.changedAt),
          rankBadge: (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${rankInfo.badgeClasses}`}
            >
              <span>🏆</span>
              {rankInfo.name}
              <span className="text-[10px] opacity-75">({rankInfo.points}pts)</span>
            </span>
          ),
          points: rankInfo.points,
          // Le rang exposé EN DONNÉE, en plus du badge JSX historique.
          rankInfo,
          // Contrats retenus par le classement backend (statut VALIDE par défaut).
          contratsRetenus: rankSnapshot?.contratsSignes ?? 0,
        }
      })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.nom.localeCompare(b.nom, 'fr'))
  }, [filteredManagers, directeurs, lastStatusActivities, rankByManager])

  // Options dynamiques pour les directeurs
  const directeurOptions = useMemo(() => {
    if (!directeurs) return []
    return directeurs.map(d => ({
      value: `${d.prenom} ${d.nom}`,
      label: `${d.prenom} ${d.nom}`,
    }))
  }, [directeurs])

  // Configuration des champs du modal d'édition
  const managersEditFields = useMemo(
    () => [
      {
        key: 'nom',
        label: 'Nom',
        type: 'text',
        required: true,
        section: 'Informations personnelles',
      },
      {
        key: 'prenom',
        label: 'Prénom',
        type: 'text',
        required: true,
        section: 'Informations personnelles',
      },
      {
        key: 'numTelephone',
        label: 'Téléphone',
        type: 'tel',
        required: true,
        section: 'Informations personnelles',
        placeholder: '+33 XX XXX XXX',
      },

      {
        key: 'directeur',
        label: 'Directeur',
        type: 'select',
        required: true,
        section: 'Affectation',
        options: directeurOptions,
      },
      {
        key: 'status',
        label: 'Statut',
        type: 'select',
        section: 'Statut',
        options: USER_STATUS_CONFIG.map(option => ({
          value: option.value,
          label: option.label,
        })),
        hint: 'Actif par défaut pour les nouveaux comptes.',
      },
    ],
    [directeurOptions]
  )

  /** Archiver = passer le manager au statut « Contrat fini » (mise à jour partielle). */
  const handleArchiveManager = async id => {
    try {
      await updateManager({ id, status: UserStatus.CONTRAT_FINIE })
      await refetch()
      showSuccess('Manager archivé (contrat fini)')
    } catch (error) {
      showError(error, 'Managers.handleArchiveManager')
      throw error
    }
  }

  const handleEditManager = async editedData => {
    try {
      const updateInput = {
        id: editedData.id,
        nom: editedData.nom,
        prenom: editedData.prenom,
        numTelephone: editedData.numTelephone,
        directeurId:
          editedData.directeur && editedData.directeur !== 'Aucun directeur'
            ? directeurs?.find(d => `${d.prenom} ${d.nom}` === editedData.directeur)?.id
            : null,
        status: editedData.status || undefined,
      }

      await updateManager(updateInput)
      await refetch()
      showSuccess('Manager modifié avec succès')
    } catch (error) {
      showError(error, 'Managers.handleEditManager')
      throw error
    }
  }

  const columns = getManagersColumns(renderStatusBadge)

  return {
    tableData,
    columns,
    permissions,
    description,
    managersLoading: managersLoading || lastActivitiesLoading,
    managersEditFields,
    handleEditManager,
    handleArchiveManager,
    isAdmin,
    statusOptions: getStatusFilterOptions(),
  }
}
