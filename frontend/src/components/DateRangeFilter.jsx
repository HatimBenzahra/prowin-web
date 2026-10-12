import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getDatePreset } from '@/hooks/utils/filters/date-presets'
import { CalendarDays, ChevronDown, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const DATE_PRESETS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'yesterday', label: 'Hier' },
  { id: 'last7days', label: '7 jours' },
  { id: 'last14days', label: '14 jours' },
  { id: 'last30days', label: '30 jours' },
  { id: 'thisWeek', label: 'Cette semaine' },
  { id: 'lastWeek', label: 'Semaine dernière' },
  { id: 'thisMonth', label: 'Ce mois-ci' },
  { id: 'lastMonth', label: 'Mois dernier' },
  { id: 'all', label: 'Tout' },
]

const formatFr = value => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR')
}

export default function DateRangeFilter({
  startDate,
  endDate,
  appliedStartDate,
  appliedEndDate,
  onChangeStart,
  onChangeEnd,
  onApply,
  onReset,
  className = '',
  title = 'Filtres de période',
  showDateTypeSelector = false,
  dateType = 'created',
  onDateTypeChange,
}) {
  const [open, setOpen] = useState(false)
  const hasApplied = Boolean(appliedStartDate || appliedEndDate)
  const hasAnyValue = Boolean(startDate || endDate || appliedStartDate || appliedEndDate)

  // Libellé du bouton déclencheur = période appliquée courante
  const triggerLabel = hasApplied
    ? `${formatFr(appliedStartDate) ?? 'Début'} – ${formatFr(appliedEndDate) ?? 'Fin'}`
    : 'Toutes les périodes'

  const handlePresetClick = preset => {
    const dates = getDatePreset(preset.id)
    onChangeStart?.(dates.start)
    onChangeEnd?.(dates.end)
    // Les dates sont passées EXPLICITEMENT à `onApply`. Auparavant il était appelé
    // sans argument dans un setTimeout, donc via la référence capturée au rendu
    // courant : sa closure tenait encore les anciennes dates et appliquait celles-là
    // — vides au premier clic. Le délai n'y changeait rien, une fonction capturée ne
    // se met pas à jour en attendant.
    onApply?.(dates.start, dates.end)
    setOpen(false)
  }

  const handleApply = () => {
    onApply?.()
    setOpen(false)
  }

  const handleReset = () => {
    onReset?.()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 justify-between gap-2 rounded-lg font-normal',
            hasApplied && 'border-primary/30 text-primary',
            className
          )}
        >
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 opacity-70" />
            <span className="tabular-nums">{triggerLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-80"
        onInteractOutside={e => {
          // Le calendrier natif de <input type="date"> s'ouvre HORS du DOM du popover :
          // cliquer un jour est vu comme une interaction "extérieure" et fermait le popover
          // avant de pouvoir cliquer « Appliquer ». On empêche la fermeture tant qu'un champ
          // date est actif (calendrier ouvert) ; le clic-ailleurs normal ferme toujours.
          const active = document.activeElement
          if (active instanceof HTMLInputElement && active.type === 'date') {
            e.preventDefault()
          }
        }}
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold">{title}</p>

          {showDateTypeSelector && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onDateTypeChange?.('created')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  dateType === 'created'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                Création
              </button>
              <button
                type="button"
                onClick={() => onDateTypeChange?.('modified')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  dateType === 'modified'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                Modification
              </button>
            </div>
          )}

          {/* Raccourcis */}
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Dates personnalisées */}
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="drf-start"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Début
                </label>
                <input
                  id="drf-start"
                  type="date"
                  value={startDate}
                  onChange={e => onChangeStart?.(e.target.value)}
                  max={endDate || new Date().toISOString().split('T')[0]}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="drf-end" className="text-[11px] font-medium text-muted-foreground">
                  Fin
                </label>
                <input
                  id="drf-end"
                  type="date"
                  value={endDate}
                  onChange={e => onChangeEnd?.(e.target.value)}
                  min={startDate || undefined}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              {hasAnyValue ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Réinitialiser
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Toutes les périodes</span>
              )}
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!startDate && !endDate}
                className="h-8 gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Appliquer
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
