import { TableSkeleton } from '@/components/LoadingSkeletons'
import { useMemo, useState } from 'react'
import PeopleListToolbar from '@/components/people/PeopleListToolbar'
import PeopleCardsView from '@/components/people/PeopleCardsView'
import { filterPeople } from '@/components/people/people-filters'
import { UserStatus } from '@/constants/domain/user-status'
import { useDirecteursLogic } from './useDirecteursLogic'

export default function Directeurs() {
  const {
    tableData,
    permissions,
    description,
    directeursLoading,
    directeursEditFields,
    handleEditDirecteur,
  } = useDirecteursLogic()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(UserStatus.ACTIF)

  const cardsPeople = useMemo(
    () => filterPeople(tableData, { search, status }),
    [tableData, search, status]
  )

  if (directeursLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Directeurs</h1>
          <p className="text-muted-foreground text-base">{description}</p>
        </div>
        <TableSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PeopleListToolbar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
      />

      <PeopleCardsView
        people={cardsPeople}
        detailsPath="/directeurs"
        factsOf={person => [
          { label: 'Email', value: person.email },
          { label: 'Téléphone', value: person.numTelephone },
        ]}
        showRanking={false}
        canEdit={permissions.canEdit}
        editFields={directeursEditFields}
        onSave={handleEditDirecteur}
        editTitle="Modifier le directeur"
        emptyLabel="Aucun directeur pour ces filtres"
      />
    </div>
  )
}
