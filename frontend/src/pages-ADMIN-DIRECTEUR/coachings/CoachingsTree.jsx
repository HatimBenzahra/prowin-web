import { useEffect, useRef } from 'react'
import {
  Archive,
  ArchiveRestore,
  Building2,
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
  BAND_META,
  BAND_RANGES,
  VISIT_RESULT_LABELS,
  isNotEvaluable,
  scoreBand,
} from '../coaching/coaching-calibration'
import { PorteStatutPill, formatDuration, isInProgress } from '../coaching/CoachingComponents'
import { dayLabel, porteLabel, rowSubject } from './coachings-utils'

/** Score coloré par bande ; « N/É » (sans chiffre) pour une visite non évaluable. */
export function ScorePill({ score, band, notEvaluable = false, className }) {
  if (notEvaluable || band === 'non_evaluable')
    return (
      <span
        title={BAND_RANGES.non_evaluable}
        className={cn(
          'rounded-full px-1.5 py-px text-xs font-medium',
          BAND_META.non_evaluable.pill,
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
        'rounded-full px-1.5 py-px text-xs font-semibold tabular-nums',
        BAND_META[b].pill,
        className
      )}
    >
      {Math.round(score)}
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
        className="h-6 px-1.5 text-xs text-primary"
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
      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        En cours
      </span>
    )
  if (a.status === 'FAILED') return <span className="text-xs font-medium text-red-600">Échec</span>
  return <ScorePill score={a.score} band={a.band} notEvaluable={isNotEvaluable(a)} />
}

/** Agrégats d'un groupe : portes, score moyen coloré, ventes. */
function GroupStats({ stats, onDark = false }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-2 text-xs',
        onDark ? 'text-sidebar-foreground/75' : 'text-muted-foreground'
      )}
    >
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
        <span
          className={cn('font-medium tabular-nums', onDark ? 'text-green-400' : 'text-green-600')}
        >
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
  onToggleArchive,
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
        selected ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-muted/50',
        // Archivé : présent, mais en retrait.
        row.archived && !selected && 'text-muted-foreground opacity-70'
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
          <PorteStatutPill statut={row.statutPorte} />
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
      {/* Au survol sur grand écran ; toujours visible au doigt et sur un archivé. */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onToggleArchive(row)
        }}
        className={cn(
          'shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:opacity-100',
          !row.archived && !selected && 'lg:opacity-0 lg:group-hover:opacity-100'
        )}
        title={row.archived ? 'Désarchiver' : 'Masquer cet enregistrement (non intéressant)'}
        aria-label={row.archived ? 'Désarchiver' : 'Archiver'}
      >
        {row.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
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
  onToggleArchive,
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
              className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 py-2 text-left text-sidebar-foreground"
            >
              <ChevronRight
                className={cn('h-4 w-4 shrink-0 transition-transform', dayOpen && 'rotate-90')}
              />
              <span className="flex-1 text-sm font-semibold first-letter:uppercase">
                {dayLabel(day.day)}
              </span>
              <GroupStats stats={day.stats} onDark />
            </button>

            {dayOpen &&
              day.groups.map(group => {
                const open = !collapsed.has(group.key)
                const flat = groupBy === 'liste'
                return (
                  <div
                    key={group.key}
                    className={cn(
                      !flat && 'mx-3 my-3 overflow-hidden rounded-lg border bg-card shadow-sm'
                    )}
                  >
                    {!flat && (
                      <div
                        className={cn(
                          'flex items-center gap-2 bg-muted/50 px-3 py-2',
                          open && 'border-b'
                        )}
                      >
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
                            <span className="line-clamp-2 break-words text-sm font-medium">
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
                      <div className={cn(!flat && 'border-t')}>
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
                            onToggleArchive={onToggleArchive}
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
