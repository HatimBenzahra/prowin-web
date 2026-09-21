import { TableSkeleton } from '@/components/LoadingSkeletons'
import { useMemo, useState } from 'react'
import PeopleListToolbar from '@/components/people/PeopleListToolbar'
import PeopleCardsView from '@/components/people/PeopleCardsView'
import RankTiersCard from '@/components/people/RankTiersCard'
import { filterPeople } from '@/components/people/people-filters'
import { UserStatus } from '@/constants/domain/user-status'
import { useManagersLogic } from './useManagersLogic'

export default function Managers() {
  const {
    tableData,
    permissions,
    managersLoading,
    managersEditFields,
    handleEditManager,
    handleArchiveManager,
  } = useManagersLogic()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(UserStatus.ACTIF)

  const cardsPeople = useMemo(
    () => filterPeople(tableData, { search, status }),
    [tableData, search, status]
  )

  if (managersLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Managers</h1>
          <p className="text-muted-foreground text-base">
            Gestion des managers régionaux et suivi de leurs équipes
          </p>
        </div>
        <TableSkeleton />
      </div>
    )
  }

  return (
    // `@container/page` : c'est la largeur du conteneur, pas celle de la fenêtre, qui
    // décide si le panneau « Paliers » tient à droite de la liste.
    <div className="@container/page space-y-6">
      <PeopleListToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
      />

      {/* minmax(0,1fr) et non 1fr : sinon la colonne refuse de descendre sous la
          largeur min-content du tableau, la grille déborde et la page scrolle.

          Le seuil porte sur `@container/page`, donc sur la largeur réellement
          disponible, pas sur celle de la fenêtre : 1536 px de viewport n'étaient pas
          atteints sur un 14 pouces alors que le conteneur en offrait 1103, largement
          de quoi tenir les deux colonnes. Budget : 680 px pour une rangée d'un seul
          tenant + 24 px de gap + 320 px de panneau = 1024. En dessous, le panneau
          Paliers est une légende de référence : il passe sous la liste. */}
      <div className="grid grid-cols-1 items-start gap-6 @min-[1024px]/page:grid-cols-[minmax(0,1fr)_320px]">
        <PeopleCardsView
          people={cardsPeople}
          detailsPath="/managers"
          showRanking={true}
          canEdit={permissions.canEdit}
          canArchive={permissions.canEdit}
          onArchive={handleArchiveManager}
          editFields={managersEditFields}
          onSave={handleEditManager}
          editTitle="Modifier le manager"
          emptyLabel="Aucun manager pour ces filtres"
        />

        <RankTiersCard />
      </div>
    </div>
  )
}
