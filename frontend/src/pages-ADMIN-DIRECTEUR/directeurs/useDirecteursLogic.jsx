import { useMemo } from 'react'
import { useDirecteurs, useUpdateDirecteur } from '@/services'
import { useEntityPage } from '@/hooks/metier/permissions/useRoleBasedData'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { useRole } from '@/contexts/userole'
import { USER_STATUS_CONFIG, getStatusFilterOptions } from '@/constants/domain/user-status'
import { useStatusBadge } from '@/hooks/utils/ui/useStatusBadge'

export function useDirecteursLogic() {
  const { showError, showSuccess } = useErrorToast()
  const { isAdmin } = useRole()

  // API hooks
  const { data: directeursApi, loading: directeursLoading, refetch } = useDirecteurs()
  const { mutate: updateDirecteur } = useUpdateDirecteur()

  // Utilisation du système de rôles pour filtrer les données
  const {
    data: filteredDirecteurs,
    permissions,
    description,
  } = useEntityPage('directeurs', directeursApi || [])

  const { renderStatusBadge } = useStatusBadge()

  // Préparation des données pour le tableau avec mapping API → UI
  const tableData = useMemo(() => {
    if (!filteredDirecteurs) return []
    return filteredDirecteurs.map(directeur => ({
      ...directeur,
      nom: directeur.nom,
      prenom: directeur.prenom,
      email: directeur.email || 'Non renseigné',
      numTelephone: directeur.numTelephone || 'Non renseigné',
      adresse: directeur.adresse || 'Non renseignée',
      status: directeur.status,
    }))
  }, [filteredDirecteurs])

  // Définition des colonnes
  const columns = useMemo(
    () => [
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
        header: 'Email',
        accessor: 'email',
        sortable: true,
        className: 'hidden sm:table-cell',
      },
      {
        header: 'Téléphone',
        accessor: 'numTelephone',
        className: 'hidden md:table-cell',
      },
      {
        header: 'Adresse',
        accessor: 'adresse',
        className: 'hidden lg:table-cell',
      },
    ],
    [renderStatusBadge]
  )

  // Configuration des champs du modal d'édition
  const directeursEditFields = useMemo(
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
        section: 'Informations personnelles',
        placeholder: '+33 XX XXX XXX',
      },
      {
        key: 'adresse',
        label: 'Adresse',
        type: 'textarea',
        section: 'Informations personnelles',
        fullWidth: true,
        placeholder: 'Adresse complète',
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
    []
  )

  const handleEditDirecteur = async editedData => {
    try {
      const updateInput = {
        id: editedData.id,
        nom: editedData.nom,
        prenom: editedData.prenom,
        numTelephone: editedData.numTelephone,
        adresse: editedData.adresse,
        status: editedData.status || undefined,
      }

      await updateDirecteur(updateInput)
      await refetch()
      showSuccess('Directeur modifié avec succès')
    } catch (error) {
      showError(error, 'Directeurs.handleEditDirecteur')
      throw error
    }
  }

  return {
    tableData,
    columns,
    permissions,
    description,
    directeursLoading,
    directeursEditFields,
    handleEditDirecteur,
    isAdmin,
    statusOptions: getStatusFilterOptions(),
  }
}
