import { useEffect, useRef } from 'react'
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Filter,
  Loader2,
  MinusCircle,
  Star,
  User2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BAND_META, VISIT_RESULT_LABELS, scoreBand } from '../coaching/coaching-calibration'
import { PorteStatutPill, formatDuration, isInProgress } from '../coaching/CoachingComponents'
import { dayLabel, porteLabel } from './coachings-utils'

/** État de l'analyse d'un audio, en une icône. */
function AnalysisIcon({ analysis }) {
  const cls = 'h-4 w-4 shrink-0'
  if (!analysis)
    return <CircleDashed className={cn(cls, 'text-muted-foreground/60')} aria-label="Non analysé" />
  if (isInProgress(analysis.status))
    return (
      <Loader2 className={cn(cls, 'animate-spin text-blue-600')} aria-label="Analyse en cours" />
    )
  if (analysis.status === 'FAILED')
    return <XCircle className={cn(cls, 'text-red-600')} aria-label="Échec de l’analyse" />
  if (analysis.quality === 'INEXPLOITABLE')
    return <MinusCircle className={cn(cls, 'text-slate-500')} aria-label="Inexploitable" />
  return <CheckCircle2 className={cn(cls, 'text-green-600')} aria-label="Analysé" />
}

/** Score coloré par bande ; ⚪ pour une visite non évaluable, rien avant la fin de l'analyse. */
export function ScorePill({ score, band, className }) {
  if (band === 'non_evaluable')
    return (
      <span
        className={cn('rounded-full px-1.5 py-px text-xs', BAND_META.non_evaluable.pill, className)}
      >
        ⚪
      </span>
    )
  if (typeof score !== 'number') return null
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-px text-xs font-semibold tabular-nums',
        BAND_META[scoreBand(score, band)].pill,
        className
      )}
    >
      {Math.round(score)}
    </span>
  )
}

/** Agrégats d'un groupe : portes, score moyen coloré, ventes. */
function GroupStats({ stats }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {stats.nbPortes} porte{stats.nbPortes > 1 ? 's' : ''}
      </span>
      {stats.scoreMoyen != null && (
        <span className="flex items-center gap-1" title="Score moyen (hors non évaluables)">
          moy. <ScorePill score={stats.scoreMoyen} />
        </span>
      )}
      {stats.nbVentes > 0 && (
        <span className="font-medium tabular-nums text-green-600">
          {stats.nbVentes} vente{stats.nbVentes > 1 ? 's' : ''}
        </span>
      )}
    </span>
  )
}

function DoorRow({ row, groupBy, selected, onSelect, onToggleFavori }) {
  const a = row.analysis
  const ready = a?.status === 'READY'
  return (
    <div
      role="option"
      aria-selected={selected}
      data-s3key={row.s3Key}
      onClick={() => onSelect(row.s3Key)}
      className={cn(
        'group flex cursor-pointer items-center gap-2 border-l-2 px-3 py-2 text-sm transition-colors',
        selected ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-muted/50'
      )}
    >
      <AnalysisIcon analysis={a} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{porteLabel(row)}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {new Date(row.createdAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {a?.visitResult ? (
            <span className="truncate">{VISIT_RESULT_LABELS[a.visitResult] || a.visitResult}</span>
          ) : (
            <PorteStatutPill statut={row.statutPorte} />
          )}
          {groupBy !== 'batiment' && <span className="truncate">· {row.adresse}</span>}
          {groupBy !== 'commercial' && row.subjectName && (
            <span className="hidden truncate xl:inline">· {row.subjectName}</span>
          )}
        </div>
      </div>
      {ready && <ScorePill score={a.score} band={a.band} />}
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatDuration(row.durationSec)}
      </span>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onToggleFavori(row)
        }}
        className="shrink-0 rounded p-0.5 hover:bg-muted"
        aria-label={row.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        <Star
          className={cn(
            'h-4 w-4',
            row.favori ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/50'
          )}
        />
      </button>
    </div>
  )
}

/**
 * Arbre du journal : jour › bâtiment (ou commercial) › portes. Repliable ; la
 * ligne sélectionnée reste en vue. Le bas de liste charge les jours précédents.
 */
export default function CoachingsTree({
  tree,
  groupBy,
  selectedKey,
  onSelect,
  collapsed,
  onToggleCollapse,
  onToggleFavori,
  onFilterBuilding,
  hasMore,
  loadingMore,
  onLoadMore,
}) {
  const sentinel = useRef(null)

  // Défilement infini : le bas de liste en vue charge les jours précédents.
  useEffect(() => {
    if (!hasMore || !sentinel.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) onLoadMore()
    })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  useEffect(() => {
    if (!selectedKey) return
    document
      .querySelector(`[data-s3key="${CSS.escape(selectedKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedKey])

  return (
    <div role="listbox" aria-label="Enregistrements" data-journal className="pb-2">
      {tree.map(day => {
        const dayOpen = !collapsed.has(day.day)
        return (
          <section key={day.day}>
            <button
              type="button"
              onClick={() => onToggleCollapse(day.day)}
              className="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 px-3 py-2 text-left backdrop-blur"
            >
              <ChevronRight
                className={cn('h-4 w-4 shrink-0 transition-transform', dayOpen && 'rotate-90')}
              />
              <span className="flex-1 text-sm font-semibold first-letter:uppercase">
                {dayLabel(day.day)}
              </span>
              <GroupStats stats={day.stats} />
            </button>

            {dayOpen &&
              day.groups.map(group => {
                const open = !collapsed.has(group.key)
                const flat = groupBy === 'liste'
                return (
                  <div key={group.key} className={cn(!flat && 'mx-2 my-2 rounded-lg border')}>
                    {!flat && (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onToggleCollapse(group.key)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                              open && 'rotate-90'
                            )}
                          />
                          {groupBy === 'commercial' ? (
                            <User2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {groupBy === 'commercial'
                                ? group.subjects[0] || 'Intervenant inconnu'
                                : group.adresse || 'Adresse inconnue'}
                            </span>
                            {groupBy === 'batiment' && group.subjects.length > 0 && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {group.subjects.join(', ')}
                              </span>
                            )}
                          </span>
                        </button>
                        <GroupStats stats={group.stats} />
                        {groupBy === 'batiment' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                            onClick={() => onFilterBuilding(group.immeubleId)}
                            title="Filtrer sur ce bâtiment"
                            aria-label="Filtrer sur ce bâtiment"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                    {(flat || open) && (
                      <div className={cn(!flat && 'border-t')}>
                        {group.rows.map(row => (
                          <DoorRow
                            key={row.s3Key}
                            row={row}
                            groupBy={groupBy}
                            selected={row.s3Key === selectedKey}
                            onSelect={onSelect}
                            onToggleFavori={onToggleFavori}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </section>
        )
      })}

      <div ref={sentinel} className="flex justify-center py-3">
        {hasMore ? (
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Charger les jours précédents
          </Button>
        ) : (
          tree.length > 0 && (
            <span className="text-xs text-muted-foreground">Début de la période atteint</span>
          )
        )}
      </div>
    </div>
  )
}
