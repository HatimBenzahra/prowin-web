import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BadgeCheck } from 'lucide-react'
import ExpandableSearch from '@/components/ExpandableSearch'
import { USER_STATUS_CONFIG } from '@/constants/domain/user-status'

/**
 * Barre commune aux pages Commerciaux, Managers et Directeurs : recherche sur le nom
 * et filtre de statut.
 *
 * La légende des paliers n'y figure plus : elle est affichée en permanence à côté du
 * tableau (`RankTiersCard`).
 */
export default function PeopleListToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  searchPlaceholder = 'Rechercher un nom…',
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ExpandableSearch value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-auto">
          <BadgeCheck className="mr-2 h-4 w-4" />
          <SelectValue placeholder="Statut..." />
        </SelectTrigger>
        <SelectContent>
          {USER_STATUS_CONFIG.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value="all">Tous les statuts</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
