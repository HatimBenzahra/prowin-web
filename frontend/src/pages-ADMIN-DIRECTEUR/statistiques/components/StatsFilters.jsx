import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DateRangeFilter from '@/components/DateRangeFilter'
import { X } from 'lucide-react'
import { SCOPE_FILTERS } from '../useStatistiquesLogic'

/**
 * Contrôles de la page : période, périmètre, intervenant.
 *
 * Une seule rangée au-dessus du contenu, sans Card autour — comme les autres pages
 * de l'app. L'ancienne version enfermait ses filtres dans une carte titrée, un
 * motif qui n'existe nulle part ailleurs et qui pesait autant que les données.
 */
export default function StatsFilters({
  dateFilter,
  scopeType,
  setScopeType,
  selectedOwner,
  setSelectedOwner,
  ownerOptions,
  activeFiltersCount,
  resetScope,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeFilter
        className="h-fit"
        startDate={dateFilter.startDate}
        endDate={dateFilter.endDate}
        appliedStartDate={dateFilter.appliedStartDate}
        appliedEndDate={dateFilter.appliedEndDate}
        onChangeStart={dateFilter.setStartDate}
        onChangeEnd={dateFilter.setEndDate}
        onApply={dateFilter.handleApplyFilters}
        onReset={dateFilter.handleResetFilters}
        title="Période d’analyse"
      />

      <Select value={scopeType} onValueChange={setScopeType}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCOPE_FILTERS.map(filter => (
            <SelectItem key={filter.value} value={filter.value}>
              {filter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedOwner} onValueChange={setSelectedOwner}>
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les intervenants</SelectItem>
          {ownerOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeFiltersCount > 0 && (
        <>
          <Badge variant="outline" className="bg-background">
            {activeFiltersCount} filtre{activeFiltersCount > 1 ? 's' : ''}
          </Badge>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={resetScope}>
            <X className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        </>
      )}
    </div>
  )
}
