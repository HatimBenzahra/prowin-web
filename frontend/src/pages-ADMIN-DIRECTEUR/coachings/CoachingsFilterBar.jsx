import { useEffect, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ClipboardCheck,
  DoorOpen,
  LayoutList,
  ListTree,
  Package,
  SlidersHorizontal,
  Sparkles,
  Star,
  User,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import DateRangeFilter from '@/components/DateRangeFilter'
import ExpandableSearch from '@/components/ExpandableSearch'
import { cn } from '@/lib/utils'
import { BAND_META, BAND_RANGES, VISIT_RESULT_LABELS } from '../coaching/coaching-calibration'
import { PORTE_STATUT_META } from '../coaching/CoachingComponents'
import {
  BAND_FILTERS,
  DEFAULT_FILTERS,
  PERIODS,
  activeFiltersCount,
  periodRange,
} from './coachings-utils'

// Valeur sentinelle pour « tous » (le Select n'accepte pas value="").
const ALL_VALUE = '__all__'

// Raccourcis de période, comme les « Enregistrements récents » de la Bibliothèque ;
// une plage libre passe par le sélecteur de dates commun (Statistiques).
const QUICK_PERIODS = PERIODS.filter(p => p.value !== 'custom')

// Libellés courts des bandes : la couleur dit la bande, le libellé dit le seuil.
const BAND_SHORT = {
  maitrise: '≥ 85',
  correct: '75–84',
  coaching: '60–74',
  insuffisant: '< 60',
  non_evaluable: 'N/É',
}

const VIEWS = [
  { value: 'batiment', label: 'Date › Bâtiment', icon: <ListTree className="h-4 w-4" /> },
  { value: 'commercial', label: 'Commercial', icon: <Users className="h-4 w-4" /> },
  { value: 'liste', label: 'Liste', icon: <LayoutList className="h-4 w-4" /> },
]

const toDay = d =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : ''

/** Choix multiple : bouton contour + compteur, cases à cocher avec la pastille de couleur. */
function MultiFilter({ icon, label, options, selected, onChange }) {
  const toggle = value =>
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  const active = selected.length > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 gap-2 font-normal', active && 'border-primary/30 text-primary')}
        >
          {icon}
          {label}
          {active && (
            <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </DropdownMenuLabel>
        {options.map(o => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={e => e.preventDefault()}
            className="gap-2"
          >
            {o.dot && <span className={cn('h-2 w-2 shrink-0 rounded-full', o.dot)} />}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
              Tout désélectionner
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Interrupteur de filtre : contour au repos, couleur primaire une fois actif. */
function ToggleFilter({ active, onClick, icon, title, children }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      className={cn('h-9 gap-2', !active && 'font-normal')}
      onClick={onClick}
      aria-pressed={active}
      title={title}
    >
      <span className={cn('inline-flex [&>svg]:h-4 [&>svg]:w-4', !active && 'opacity-70')}>
        {icon}
      </span>
      {children}
    </Button>
  )
}

/**
 * Barre de filtres de la page Coachings, faite des contrôles des autres pages : les
 * raccourcis de période de la Bibliothèque et le sélecteur de dates des Statistiques,
 * les Select à icône, la recherche repliable et le contrôle segmenté des Bâtiments,
 * le compteur de filtres et « Réinitialiser » des Statistiques. Pas de Card autour,
 * comme ailleurs. Contrôlée : `filters` vient de l'URL et `onChange(patch)` l'y
 * réécrit — un lien copié rouvre exactement la même vue.
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

  // Brouillon du sélecteur de dates, prérempli avec la plage affichée.
  const [draft, setDraft] = useState({ from: '', to: '' })
  useEffect(() => {
    const { dateFrom, dateTo } = periodRange(filters)
    setDraft({ from: toDay(dateFrom), to: toDay(dateTo) })
  }, [filters.period, filters.from, filters.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBand = band =>
    onChange({
      bands: filters.bands.includes(band)
        ? filters.bands.filter(b => b !== band)
        : [...filters.bands, band],
    })

  const count = activeFiltersCount(filters)
  const reset = () =>
    onChange({
      ...DEFAULT_FILTERS,
      period: filters.period,
      from: filters.from,
      to: filters.to,
      group: filters.group,
    })
  const custom = filters.period === 'custom'
  // Replié par défaut, sauf si l'URL arrive déjà avec des filtres de contenu.
  const [moreOpen, setMoreOpen] = useState(() => activeFiltersCount(filters) > 0)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_PERIODS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange({ period: p.value })}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filters.period === p.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
        <DateRangeFilter
          startDate={draft.from}
          endDate={draft.to}
          appliedStartDate={custom ? filters.from : ''}
          appliedEndDate={custom ? filters.to : ''}
          onChangeStart={from => setDraft(d => ({ ...d, from }))}
          onChangeEnd={to => setDraft(d => ({ ...d, to }))}
          onApply={(from = draft.from, to = draft.to) => onChange({ period: 'custom', from, to })}
          onReset={() => onChange({ period: DEFAULT_FILTERS.period, from: '', to: '' })}
          className={cn(!custom && 'text-muted-foreground')}
          title="Période des écoutes"
        />
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={filters.subject || ALL_VALUE}
          onValueChange={v => onChange({ subject: v === ALL_VALUE ? '' : v })}
        >
          <SelectTrigger
            className={cn(
              'h-9 min-w-0 flex-1',
              filters.subject && 'border-primary/30 text-primary'
            )}
          >
            <User className="mr-2 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Commercial..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous les commerciaux</SelectItem>
            {subjects.map(s => (
              <SelectItem
                key={`${s.subjectRole}-${s.subjectId}`}
                value={`${s.subjectRole}:${s.subjectId}`}
              >
                {s.subjectName}
                {s.subjectRole === 'manager' ? ' (manager)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ExpandableSearch value={q} onChange={setQ} placeholder="Rechercher une adresse…" />

        {/* Les filtres de contenu se replient : la liste garde la hauteur. */}
        <Button
          variant="outline"
          className={cn(
            'h-9 shrink-0 gap-2 font-normal',
            count > 0 && 'border-primary/30 text-primary'
          )}
          onClick={() => setMoreOpen(o => !o)}
          aria-expanded={moreOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtres
          {count > 0 && (
            <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{count}</Badge>
          )}
          <ChevronDown
            className={cn('h-4 w-4 opacity-60 transition-transform', moreOpen && 'rotate-180')}
          />
        </Button>

        {/* Contrôle segmenté, comme Grille / Liste des Bâtiments ; icônes seules. */}
        <div className="inline-flex shrink-0 items-center rounded-md border border-input p-0.5">
          {VIEWS.map(({ value, label, icon }) => (
            <Button
              key={value}
              variant={filters.group === value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onChange({ group: value })}
              className="h-7 w-8 p-0"
              title={label}
              aria-label={label}
            >
              {icon}
            </Button>
          ))}
        </div>
      </div>

      {(filters.immeubles.length > 0 || (!moreOpen && count > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.immeubles.length > 0 && (
            <Badge
              variant="outline"
              className="h-7 gap-1.5 border-primary/30 bg-primary/10 px-2.5 text-primary"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span className="max-w-[220px] truncate">{buildingLabel}</span>
              <button
                type="button"
                onClick={() => onChange({ immeubles: [] })}
                className="rounded-sm hover:bg-primary/20"
                aria-label="Retirer le filtre bâtiment"
                title="Retirer le filtre bâtiment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          )}
          {!moreOpen && count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={reset}>
              <X className="h-3.5 w-3.5" />
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      )}

      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <MultiFilter
            icon={<DoorOpen className="h-4 w-4 opacity-70" />}
            label="Statut porte"
            options={Object.entries(PORTE_STATUT_META).map(([value, m]) => ({
              value,
              label: m.label,
              dot: m.dot,
            }))}
            selected={filters.statuts}
            onChange={statuts => onChange({ statuts })}
          />
          <MultiFilter
            icon={<ClipboardCheck className="h-4 w-4 opacity-70" />}
            label="Résultat de visite"
            options={Object.entries(VISIT_RESULT_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={filters.resultats}
            onChange={resultats => onChange({ resultats })}
          />

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
              <SelectTrigger
                className={cn('h-9 w-auto', filters.produit && 'border-primary/30 text-primary')}
              >
                <Package className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Produit..." />
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
            <ToggleFilter
              active={filters.accepte}
              icon={<ClipboardCheck />}
              onClick={() => onChange({ accepte: !filters.accepte })}
              title="Sinon : produit proposé (présenté, refusé ou accepté)"
            >
              Accepté seulement
            </ToggleFilter>
          )}

          <ToggleFilter
            active={filters.favoris}
            icon={<Star />}
            onClick={() => onChange({ favoris: !filters.favoris })}
          >
            Favoris
          </ToggleFilter>
          <ToggleFilter
            active={filters.nonAnalyses}
            icon={<Sparkles />}
            onClick={() => onChange({ nonAnalyses: !filters.nonAnalyses })}
          >
            Non analysés
          </ToggleFilter>

          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Bande de score"
          >
            {BAND_FILTERS.map(band => {
              const active = filters.bands.includes(band)
              const meta = BAND_META[band]
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => toggleBand(band)}
                  title={BAND_RANGES[band]}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors',
                    active
                      ? cn(meta.pill, 'border-current')
                      : 'border-input bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {BAND_SHORT[band]}
                </button>
              )
            })}
          </div>

          {count > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset}>
              <X className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
