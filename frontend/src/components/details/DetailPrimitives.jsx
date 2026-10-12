import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import GameIcon from '@/components/gamification/GameIcon'

/**
 * Écart d'un KPI par rapport à la période précédente.
 *
 * `goodDirection` existe parce que « ça monte » n'est pas toujours une bonne
 * nouvelle : +12 contrats se colore en vert, +12 refus en rouge. Sans ce
 * paramètre, la couleur mentirait sur la moitié des indicateurs.
 */
function DeltaLine({ delta, suffix, goodDirection = 'up', label = 'vs période précédente' }) {
  if (delta == null || Number.isNaN(delta)) return null

  const rounded = Math.round(delta * 10) / 10
  if (rounded === 0) {
    return <p className="mt-1.5 text-xs text-muted-foreground">Stable {label}</p>
  }

  const isUp = rounded > 0
  const isGood = goodDirection === 'up' ? isUp : !isUp
  const formatted = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
    signDisplay: 'always',
  }).format(rounded)

  return (
    <p
      className={`mt-1.5 flex items-center gap-1 text-xs font-semibold tabular-nums ${
        isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
      }`}
    >
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {formatted}
      {suffix}
      <span className="font-normal text-muted-foreground">{label}</span>
    </p>
  )
}

/**
 * Teintes de la pastille d'icône. `neutral` est le défaut de toute l'application ;
 * les teintes nommées viennent des KPI du tableau de bord, qui distinguaient ses
 * quatre indicateurs par la couleur.
 */
const TILE_ACCENTS = {
  neutral: 'border-border/60 bg-muted/60 text-primary',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400',
}

/**
 * Quatre densités, du plus compact (grilles à 5 colonnes) au chiffre vedette d'une
 * tuile pleine largeur. Rien d'autre ne varie : même gabarit, même ordre.
 */
const TILE_SIZES = {
  sm: {
    shell: 'p-3',
    badge: 'h-6 w-6',
    glyph: 'h-3.5 w-3.5',
    glyphSize: 14,
    label: 'text-[11px]',
    value: 'mt-1.5 text-xl',
  },
  md: {
    shell: 'p-4',
    badge: 'h-7 w-7',
    glyph: 'h-4 w-4',
    glyphSize: 16,
    label: 'text-xs',
    value: 'mt-2 text-2xl',
  },
  lg: {
    shell: 'p-4',
    badge: 'h-8 w-8',
    glyph: 'h-4 w-4',
    glyphSize: 18,
    label: 'text-xs',
    value: 'mt-2 text-3xl',
  },
  xl: {
    shell: 'p-5',
    badge: 'h-9 w-9',
    glyph: 'h-5 w-5',
    glyphSize: 20,
    label: 'text-sm',
    value: 'mt-2 text-4xl md:text-5xl',
  },
}

/**
 * Tuile KPI : libellé + valeur + indice. **La seule tuile de l'application** — le
 * tableau de bord, les statistiques, les sections prospection et les fiches détail
 * en avaient chacun leur copie.
 *
 * L'icône est en tête du libellé, pas rejetée à droite en `justify-between` : sur une
 * colonne étroite, la répartition aux deux bords creusait un trou central, tronquait
 * le libellé et n'alignait la valeur sur rien.
 *
 * `iconName` = clé du pack Game Icons (`GameIcon`), `icon` = composant lucide. `delta`
 * affiche l'écart vs période précédente — un chiffre nu n'informe pas.
 */
export function StatTile({
  iconName,
  icon: Icon,
  accent = 'neutral',
  size = 'md',
  interactive = false,
  label,
  value,
  hint,
  valueClassName,
  delta,
  deltaSuffix,
  deltaGoodDirection,
  deltaLabel,
  footer,
}) {
  const dims = TILE_SIZES[size] || TILE_SIZES.md
  const hasIcon = Boolean(Icon || iconName)

  return (
    <div
      className={`rounded-xl border border-border/60 bg-card ${dims.shell} ${
        interactive ? 'transition-shadow duration-200 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Pas de créneau réservé quand il n'y a pas d'icône : une place vide se lit
            comme une icône manquante.
            RÈGLE D'APPEL, en contrepartie : une grille de tuiles doit être
            **homogène** — toutes ses tuiles avec icône, ou aucune. Une grille mixte
            décale le libellé d'une tuile à l'autre, ce qui est précisément le défaut
            d'alignement que ce composant existe pour éviter. */}
        {hasIcon && (
          <span
            className={`flex ${dims.badge} shrink-0 items-center justify-center rounded-lg border ${
              TILE_ACCENTS[accent] || TILE_ACCENTS.neutral
            }`}
          >
            {Icon ? (
              <Icon className={dims.glyph} />
            ) : (
              <GameIcon name={iconName} size={dims.glyphSize} />
            )}
          </span>
        )}
        <p
          className={`truncate font-medium uppercase tracking-wide text-muted-foreground ${dims.label}`}
        >
          {label}
        </p>
      </div>

      <p className={`font-bold tracking-tight tabular-nums ${dims.value} ${valueClassName || ''}`}>
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      <DeltaLine
        delta={delta}
        suffix={deltaSuffix}
        goodDirection={deltaGoodDirection}
        label={deltaLabel}
      />
      {footer}
    </div>
  )
}

/** Titre de section (point + libellé), aligné sur le style des onglets. */
export function SectionTitle({ children }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-2 w-2 rounded-full bg-primary" />
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
    </div>
  )
}

function couvertureBadgeClass(value) {
  if (value >= 80)
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (value >= 50) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
}

const BUILDINGS_PER_PAGE = 12

/**
 * Table « Bâtiments prospectés » (5 colonnes, paginée). `onRowClick` optionnel
 * (clic → façade côté commercial ; absent côté manager).
 */
export function BuildingsTable({ rows, onRowClick }) {
  const [page, setPage] = useState(0)

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">Aucun bâtiment prospecté</p>
    )
  }

  const totalPages = Math.ceil(rows.length / BUILDINGS_PER_PAGE)
  const current = Math.min(page, totalPages - 1)
  const start = current * BUILDINGS_PER_PAGE
  const paged = rows.slice(start, start + BUILDINGS_PER_PAGE)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adresse</TableHead>
                <TableHead className="text-center">Portes</TableHead>
                <TableHead className="text-center">Couverture</TableHead>
                <TableHead className="text-center">Contrats</TableHead>
                <TableHead className="text-center">RDV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(row => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  title={onRowClick ? 'Voir la façade du bâtiment' : undefined}
                >
                  <TableCell className="font-medium">{row.address}</TableCell>
                  <TableCell className="text-center tabular-nums">{row.total_doors}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={couvertureBadgeClass(row.couverture || 0)}>
                      {row.couverture || 0}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-green-100 text-green-800">
                      {row.contrats_signes || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-blue-100 text-blue-800">{row.rdv_pris || 0}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {start + 1}–{Math.min(start + BUILDINGS_PER_PAGE, rows.length)} sur {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              {current + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= totalPages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
