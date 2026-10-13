import { useEffect, useState } from 'react'
import { Building2, ChevronDown, Search, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { BAND_META, BAND_RANGES, VISIT_RESULT_LABELS } from '../coaching/coaching-calibration'
import { PORTE_STATUT_META } from '../coaching/CoachingComponents'
import { BAND_FILTERS, DEFAULT_FILTERS, GROUP_BY, PERIODS, periodRange } from './coachings-utils'

const toDay = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Valeur sentinelle pour « tous » (le Select n'accepte pas value="").
const ALL_VALUE = '__all__'

const chip = active =>
  cn(
    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
    active
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-border/60 text-muted-foreground hover:bg-muted/60'
  )

/** Choix multiple compact : « Statut porte · 2 » plutôt qu'une rangée de badges. */
function MultiFilter({ label, options, selected, onChange }) {
  const toggle = value =>
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={chip(selected.length > 0)}>
          {label}
          {selected.length > 0 && <span className="tabular-nums">· {selected.length}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.map(o => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={e => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Barre de filtres de la page Coachings. Contrôlée : `filters` vient de l'URL et
 * `onChange(patch)` l'y réécrit — un lien copié rouvre exactement la même vue.
 */
export default function CoachingsFilterBar({
  filters,
  onChange,
  subjects,
  products,
  buildingLabel,
}) {
  // Recherche bâtiment débouncée → URL (pas une requête par frappe).
  const [q, setQ] = useState(filters.q)
  useEffect(() => setQ(filters.q), [filters.q])
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => onChange({ q }), 400)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // « Période » part de la plage affichée, pour l'ajuster plutôt que tout ressaisir.
  const periodPatch = period => {
    if (period !== 'custom' || filters.from || filters.to) return { period }
    const { dateFrom, dateTo } = periodRange(filters)
    return { period, from: toDay(dateFrom), to: toDay(dateTo) }
  }

  const toggleBand = band =>
    onChange({
      bands: filters.bands.includes(band)
        ? filters.bands.filter(b => b !== band)
        : [...filters.bands, band],
    })

  const isFiltered = Object.keys(DEFAULT_FILTERS).some(
    key =>
      key !== 'group' &&
      key !== 'period' &&
      JSON.stringify(filters[key]) !== JSON.stringify(DEFAULT_FILTERS[key])
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border/60 p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(periodPatch(p.value))}
              className={cn(
                'h-7 rounded px-2.5 text-sm transition-colors',
                filters.period === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filters.period === 'custom' && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={e => onChange({ from: e.target.value })}
              className="h-8 w-[150px]"
              aria-label="Du"
            />
            <span>au</span>
            <Input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={e => onChange({ to: e.target.value })}
              className="h-8 w-[150px]"
              aria-label="Au"
            />
          </div>
        )}

        <Select
          value={filters.subject || ALL_VALUE}
          onValueChange={v => onChange({ subject: v === ALL_VALUE ? '' : v })}
        >
          <SelectTrigger className="h-8 w-[200px] text-sm">
            <SelectValue placeholder="Commercial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous les commerciaux</SelectItem>
            {subjects.map(s => (
              <SelectItem
                key={`${s.subjectRole}-${s.subjectId}`}
                value={`${s.subjectRole}:${s.subjectId}`}
              >
                {s.subjectName}
                {s.subjectRole === 'manager' ? ' (mgr)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-full sm:w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Adresse du bâtiment…"
            className="h-8 pl-8"
          />
        </div>

        {filters.immeubles.length > 0 && (
          <button
            type="button"
            className={chip(true)}
            onClick={() => onChange({ immeubles: [] })}
            title="Retirer le filtre bâtiment"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{buildingLabel}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          className={chip(filters.favoris)}
          onClick={() => onChange({ favoris: !filters.favoris })}
        >
          <Star className={cn('h-3.5 w-3.5', filters.favoris && 'fill-amber-500 text-amber-500')} />
          Favoris
        </button>
        <button
          type="button"
          className={chip(filters.nonAnalyses)}
          onClick={() => onChange({ nonAnalyses: !filters.nonAnalyses })}
        >
          Non analysés
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label="Statut porte"
          options={Object.entries(PORTE_STATUT_META).map(([value, m]) => ({
            value,
            label: m.label,
          }))}
          selected={filters.statuts}
          onChange={statuts => onChange({ statuts })}
        />
        <MultiFilter
          label="Résultat de visite"
          options={Object.entries(VISIT_RESULT_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filters.resultats}
          onChange={resultats => onChange({ resultats })}
        />

        <div className="flex items-center gap-1">
          {BAND_FILTERS.map(band => (
            <button
              key={band}
              type="button"
              onClick={() => toggleBand(band)}
              title={BAND_RANGES[band]}
              aria-pressed={filters.bands.includes(band)}
              className={cn(chip(filters.bands.includes(band)), 'px-2')}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', BAND_META[band].dot)} />
            </button>
          ))}
        </div>

        {products.length > 0 && (
          <Select
            value={filters.produit || ALL_VALUE}
            onValueChange={v =>
              onChange({
                produit: v === ALL_VALUE ? '' : v,
                ...(v === ALL_VALUE ? { accepte: false } : {}),
              })
            }
          >
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Produit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tous les produits</SelectItem>
              {products.map(p => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filters.produit && (
          <button
            type="button"
            className={chip(filters.accepte)}
            onClick={() => onChange({ accepte: !filters.accepte })}
            title="Sinon : produit proposé (présenté, refusé ou accepté)"
          >
            Accepté seulement
          </button>
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() =>
              onChange({
                ...DEFAULT_FILTERS,
                period: filters.period,
                from: filters.from,
                to: filters.to,
                group: filters.group,
              })
            }
          >
            <X className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        )}

        <div className="ml-auto inline-flex rounded-md border border-border/60 p-0.5">
          {GROUP_BY.map(g => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ group: g.value })}
              className={cn(
                'h-7 rounded px-2.5 text-sm transition-colors',
                filters.group === g.value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
