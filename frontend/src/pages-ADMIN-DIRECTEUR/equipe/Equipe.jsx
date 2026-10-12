import { useMemo, useState } from 'react'
import { TableSkeleton } from '@/components/LoadingSkeletons'
import PeopleListToolbar from '@/components/people/PeopleListToolbar'
import PeopleCardsView from '@/components/people/PeopleCardsView'
import RankTiersCard from '@/components/people/RankTiersCard'
import GuideVideoCard from '@/components/guide/GuideVideoCard'
import { filterPeople } from '@/components/people/people-filters'
import { UserStatus } from '@/constants/domain/user-status'
import { useCommerciauxLogic } from '../commercial/useCommerciauxLogic'
import { useManagersLogic } from '../managers/useManagersLogic'

/**
 * Équipe — commerciaux et managers dans une seule liste.
 *
 * C'est la page vers laquelle pointe la sidebar en mode simple. Elle existe comme
 * route propre (`/equipe`) plutôt que de faire varier le contenu de `/commerciaux`
 * selon la préférence de sidebar : une URL doit rendre la même chose quel que soit un
 * réglage d'affichage.
 *
 * Les deux rôles ne partagent ni route de fiche, ni champs d'édition, ni mutation :
 * chaque ligne porte donc son `detailsPath`, ses `editFields` et son `onSaveEdit`.
 * Les identifiants pouvant se recouper entre les deux tables, la clé de ligne est
 * préfixée par le rôle.
 */
export default function Equipe() {
  const {
    tableData: commerciaux,
    permissions: commerciauxPermissions,
    loading: commerciauxLoading,
    commerciauxEditFields,
    handleEditCommercial,
    handleArchiveCommercial,
  } = useCommerciauxLogic()

  const {
    tableData: managers,
    permissions: managersPermissions,
    managersLoading,
    managersEditFields,
    handleEditManager,
    handleArchiveManager,
  } = useManagersLogic()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(UserStatus.ACTIF)

  const people = useMemo(() => {
    const merged = [
      ...(commerciaux || []).map(person => ({
        ...person,
        rowKey: `commercial-${person.id}`,
        roleLabel: 'Commercial',
        detailsPath: '/commerciaux',
        editFields: commerciauxEditFields,
        onSaveEdit: handleEditCommercial,
        onArchive: handleArchiveCommercial,
      })),
      ...(managers || []).map(person => ({
        ...person,
        rowKey: `manager-${person.id}`,
        roleLabel: 'Manager',
        detailsPath: '/managers',
        editFields: managersEditFields,
        onSaveEdit: handleEditManager,
        onArchive: handleArchiveManager,
      })),
    ]

    // Les mieux classés d'abord, puis les non classés par nom.
    return merged.sort((a, b) => {
      const pointsDiff = (b.rankInfo?.points ?? 0) - (a.rankInfo?.points ?? 0)
      if (pointsDiff !== 0) return pointsDiff
      return (a.nom || '').localeCompare(b.nom || '', 'fr')
    })
  }, [
    commerciaux,
    managers,
    commerciauxEditFields,
    handleEditCommercial,
    handleArchiveCommercial,
    managersEditFields,
    handleEditManager,
    handleArchiveManager,
  ])

  const visiblePeople = useMemo(
    () => filterPeople(people, { search, status }),
    [people, search, status]
  )

  if (commerciauxLoading || managersLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Équipe</h1>
          <p className="text-base text-muted-foreground">Commerciaux et managers</p>
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
        searchPlaceholder="Rechercher un commercial ou un manager…"
      />

      {/* minmax(0,1fr) et non 1fr : sinon la colonne refuse de descendre sous la
          largeur min-content de son contenu et la page scrolle horizontalement.

          Le seuil porte sur `@container/page`, donc sur la largeur réellement
          disponible, pas sur celle de la fenêtre : 1536 px de viewport n'étaient pas
          atteints sur un 14 pouces alors que le conteneur en offrait 1103, largement
          de quoi tenir les deux colonnes. Budget : 680 px pour une rangée d'un seul
          tenant + 24 px de gap + 320 px de panneau = 1024. En dessous, le panneau
          Paliers est une légende de référence : il passe sous la liste. */}
      <div className="grid grid-cols-1 items-start gap-6 @min-[1024px]/page:grid-cols-[minmax(0,1fr)_320px]">
        {/* Pas de `factsOf` : la hiérarchie manager / directeur n'est pas affichée ici,
            elle reste sur les pages Commerciaux et Managers de la vue avancée. */}
        <PeopleCardsView
          people={visiblePeople}
          canEdit={commerciauxPermissions.canEdit || managersPermissions.canEdit}
          canArchive={commerciauxPermissions.canEdit || managersPermissions.canEdit}
          editTitle="Modifier la fiche"
          emptyLabel="Aucun membre pour ces filtres"
        />

        {/* Colonne latérale : les paliers d'abord — ils expliquent les chiffres de la
            liste — puis le guide, qui explique le reste du parcours. */}
        <div className="space-y-6">
          <RankTiersCard />
          <GuideVideoCard />
        </div>
      </div>
    </div>
  )
}
