import { useEffect, useRef } from 'react'
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Filter,
  Loader2,
  Sparkles,
  Star,
  User2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BAND_RANGES,
  VISIT_RESULT_LABELS,
  isNotEvaluable,
  scoreBand,
} from '../coaching/coaching-calibration'
import { PORTE_STATUT_META, formatDuration, isInProgress } from '../coaching/CoachingComponents'
import { BAND_TONE, STATUT_TONE, TONE_NEUTRAL } from '../coaching/coaching-tones'
import { dayLabel, porteLabel, rowSubject } from './coachings-utils'

/** Score coloré par bande ; « N/É » (sans chiffre) pour une visite non évaluable. */
export function ScorePill({ score, band, notEvaluable = false, className }) {
  if (notEvaluable || band === 'non_evaluable')
    return (
      <span
        title={BAND_RANGES.non_evaluable}
        className={cn(
          'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset',
          BAND_TONE.non_evaluable.chip,
          className
        )}
      >
        ⚪ N/É
      </span>
    )
  if (typeof score !== 'number') return null
  const b = scoreBand(score, band)
  return (
    <span
      title={BAND_RANGES[b]}
      className={cn(
        'inline-flex h-5 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ring-1 ring-inset',
        BAND_TONE[b].chip,
        className
      )}
    >
      {Math.round(score)}
    </span>
  )
}

/** Statut de la porte : pastille teintée, lisible en mode sombre. */
export function StatutBadge({ statut, className }) {
  if (!statut) return <span className="text-xs text-muted-foreground">—</span>
  const meta = PORTE_STATUT_META[statut] || { label: statut, dot: 'bg-slate-400' }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ring-1 ring-inset',
        STATUT_TONE[statut] || TONE_NEUTRAL,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

/**
 * État de l'analyse d'un audio, en clair : son score, « Analyser » s'il n'en a pas,
 * « En cours » ou « Échec » sinon.
 */
function AnalysisCell({ row, launching, onLaunch }) {
  const a = row.analysis
  if (!a)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 bg-primary/10 px-2 text-xs text-primary hover:bg-primary/20 hover:text-primary"
        disabled={launching}
        onClick={e => {
          e.stopPropagation()
          onLaunch(row)
        }}
      >
        {launching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        Analyser
      </Button>
    )
  if (isInProgress(a.status))
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        En cours
      </span>
    )
  if (a.status === 'FAILED')
    return <span className="text-xs font-medium text-red-600 dark:text-red-400">Échec</span>
  return <ScorePill score={a.score} band={a.band} notEvaluable={isNotEvaluable(a)} />
}

/** Agrégats d'un groupe : portes, score moyen coloré, ventes. */
function GroupStats({ stats }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {stats.nbPortes} porte{stats.nbPortes > 1 ? 's' : ''}
      </span>
      {stats.scoreMoyen != null && (
        <span
          className="flex items-center gap-1"
          title={`Score moyen sur ${stats.nbAnalyses} analyse${stats.nbAnalyses > 1 ? 's' : ''} notée${stats.nbAnalyses > 1 ? 's' : ''} (hors non évaluables)`}
        >
          moy. <ScorePill score={stats.scoreMoyen} />
        </span>
      )}
      {stats.nbVentes > 0 && (
        <span className="inline-flex h-5 items-center rounded-full bg-green-500/15 px-2 font-medium tabular-nums text-green-700 ring-1 ring-green-500/30 ring-inset dark:text-green-400">
          {stats.nbVentes} vente{stats.nbVentes > 1 ? 's' : ''}
        </span>
      )}
    </span>
  )
}

function DoorRow({
  row,
  groupBy,
  groupSubjects,
  selected,
  onSelect,
  onToggleFavori,
  launching,
  onLaunch,
}) {
  const a = row.analysis
  const subject = rowSubject(row, groupBy, groupSubjects)
  return (
    <div
      role="option"
      aria-selected={selected}
      data-s3key={row.s3Key}
      onClick={() => onSelect(row.s3Key)}
      className={cn(
        'group flex cursor-pointer items-center gap-2 border-l-2 px-3 py-2 text-sm transition-colors',
        // Comme l'entrée active de la sidebar : fond accent (relevé d'une pointe de la
        // couleur primaire de la sidebar, sinon trop proche du fond) et filet orange.
        selected
          ? 'border-l-orange-500 bg-[color-mix(in_oklch,var(--sidebar-primary)_18%,var(--sidebar-accent))] text-sidebar-accent-foreground'
          : 'border-l-transparent hover:bg-sidebar-accent/50'
      )}
    >
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
          <StatutBadge statut={row.statutPorte} />
          {a?.visitResult && (
            <span className="truncate" title="Résultat de visite selon l’IA">
              IA : {VISIT_RESULT_LABELS[a.visitResult] || a.visitResult}
            </span>
          )}
          {groupBy !== 'batiment' && <span className="truncate">· {row.adresse}</span>}
          {subject && <span className="truncate">· {subject}</span>}
        </div>
      </div>
      <span className="flex w-20 shrink-0 justify-end">
        <AnalysisCell row={row} launching={launching} onLaunch={onLaunch} />
      </span>
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
        title={row.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
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
  launching,
  onLaunch,
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
              className="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-background/95 px-3 py-2 text-left backdrop-blur hover:bg-muted/60"
            >
              <ChevronRight
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  dayOpen && 'rotate-90'
                )}
              />
              <span className="hidden sm:flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarDays className="h-3.5 w-3.5" />
              </span>
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
                  // Filet gauche à la couleur de la bande du score moyen : on repère
                  // d'un coup d'œil les bâtiments à reprendre.
                  <div
                    key={group.key}
                    className={cn(
                      !flat && 'mx-2 my-2 overflow-hidden rounded-lg border border-l-[3px] bg-card',
                      !flat &&
                        (group.stats.band ? BAND_TONE[group.stats.band].accent : 'border-l-border')
                    )}
                  >
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
                          <span className="hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            {groupBy === 'commercial' ? (
                              <User2 className="h-4 w-4" />
                            ) : (
                              <Building2 className="h-4 w-4" />
                            )}
                          </span>
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
                            onClick={() => onFilterBuilding(group.immeubleIds)}
                            title="Filtrer sur ce bâtiment"
                            aria-label="Filtrer sur ce bâtiment"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                    {(flat || open) && (
                      <div className={cn(!flat && 'divide-y divide-border/40 border-t')}>
                        {group.rows.map(row => (
                          <DoorRow
                            key={row.s3Key}
                            row={row}
                            groupBy={groupBy}
                            groupSubjects={group.subjects}
                            launching={launching.has(row.s3Key)}
                            onLaunch={onLaunch}
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
