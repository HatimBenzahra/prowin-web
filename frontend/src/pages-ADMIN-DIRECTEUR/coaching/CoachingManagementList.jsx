import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Eye, Star, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ExpandableSearch from '@/components/ExpandableSearch'
import { cn } from '@/lib/utils'
import CoachingService from '@/services/coaching/coaching.service'
import { useCoachingManagement } from './useCoachingManagement'
import CoachingDetailModal from './CoachingDetailModal'
import {
  PorteStatutPill,
  STATUT_FILTERS,
  formatDuration,
  isInProgress,
} from './CoachingComponents'

// Valeurs sentinelles pour « tous » (le Select n'accepte pas value="").
const ALL_STATUTS_VALUE = '__all__'
const ALL_SUBJECTS_VALUE = '__all__'
const ALL_DURATION_VALUE = '__all__'
const DURATION_TIERS = [
  { value: 'lt1', label: 'Moins d’1 min' },
  { value: '1to3', label: '1 à 3 min' },
  { value: 'gt3', label: 'Plus de 3 min' },
]

// Indicateur d'état d'analyse d'un enregistrement.
function AnalyseIndicator({ status, quality, score }) {
  if (!status)
    return <span className="text-xs text-muted-foreground">Non analysé</span>
  if (status === 'PENDING')
    return <span className="text-xs font-medium text-amber-600">En file</span>
  if (status === 'TRANSCRIBING' || status === 'ANALYZING')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === 'TRANSCRIBING' ? 'Transcription' : 'Évaluation'}
      </span>
    )
  if (status === 'FAILED')
    return <span className="text-xs font-medium text-red-600">Échec</span>
  if (status !== 'READY') return <span className="text-xs text-muted-foreground">En cours</span>
  if (quality === 'INEXPLOITABLE')
    return <span className="text-xs text-slate-500">Inexploitable</span>
  // READY
  return (
    <span className="text-sm font-semibold tabular-nums text-green-600">
      {typeof score === 'number' ? `${Math.round(score)}/100` : 'Analysé'}
    </span>
  )
}

/**
 * Liste de gestion des enregistrements coachables (recherche + filtres +
 * sélection multiple + lancement). Réutilisable :
 * - `initialSubjectId` pré-règle le filtre commercial/manager ;
 * - `lockSubject` masque le sélecteur de sujet (liste verrouillée sur un sujet,
 *   ex. modal ouvert depuis la synthèse d'une fiche).
 */
export default function CoachingManagementList({
  initialSubjectId = null,
  lockSubject = false,
}) {
  const {
    items,
    total,
    loading,
    page,
    pageCount,
    setPage,
    statut,
    setStatut,
    search,
    setSearch,
    favorisOnly,
    setFavorisOnly,
    subjectId,
    setSubjectId,
    durationTier,
    setDurationTier,
    notAnalyzedOnly,
    setNotAnalyzedOnly,
    subjects,
    selected,
    toggleSelect,
    clearSelection,
    selectAll,
    launching,
    launch,
    toggleFavori,
  } = useCoachingManagement({ initialSubjectId })

  // Recherche locale débouncée → filtre serveur.
  const [searchInput, setSearchInput] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Modal de détail (ouvert via « Voir »).
  const [modalAnalysis, setModalAnalysis] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)

  const openDetail = async (analysisId) => {
    if (!analysisId) return
    setModalLoading(true)
    const a = await CoachingService.get(analysisId)
    setModalAnalysis(a)
    setModalLoading(false)
  }

  const selectableKeys = items
    .filter((it) => !isInProgress(it.analysisStatus))
    .map((it) => it.s3Key)
  const allSelected =
    selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k))

  return (
    <div className="space-y-3">
      {/* Barre de filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <ExpandableSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Nom, adresse, porte…"
        />
        <Select
          value={statut || ALL_STATUTS_VALUE}
          onValueChange={(v) => setStatut(v === ALL_STATUTS_VALUE ? '' : v)}
        >
          <SelectTrigger className="h-8 w-[170px] text-sm">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUTS_VALUE}>Tous les statuts</SelectItem>
            {STATUT_FILTERS.filter((f) => f.value !== 'ALL').map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtre par commercial / manager — masqué si la liste est verrouillée
            sur un sujet (ex. modal ouvert depuis la synthèse d'une fiche). */}
        {!lockSubject && (
          <Select
            value={subjectId != null ? String(subjectId) : ALL_SUBJECTS_VALUE}
            onValueChange={(v) =>
              setSubjectId(v === ALL_SUBJECTS_VALUE ? null : Number(v))
            }
          >
            <SelectTrigger className="h-8 w-[190px] text-sm">
              <SelectValue placeholder="Commercial / manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS_VALUE}>Tous les commerciaux</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={`${s.subjectRole}-${s.subjectId}`} value={String(s.subjectId)}>
                  {s.subjectName}
                  {s.subjectRole === 'manager' ? ' (mgr)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtre par durée */}
        <Select
          value={durationTier || ALL_DURATION_VALUE}
          onValueChange={(v) => setDurationTier(v === ALL_DURATION_VALUE ? '' : v)}
        >
          <SelectTrigger className="h-8 w-[150px] text-sm">
            <SelectValue placeholder="Durée" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DURATION_VALUE}>Toutes durées</SelectItem>
            {DURATION_TIERS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Non analysés uniquement */}
        <button
          type="button"
          onClick={() => setNotAnalyzedOnly(!notAnalyzedOnly)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
            notAnalyzedOnly
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:bg-muted/60',
          )}
        >
          Non analysés
        </button>

        <button
          type="button"
          onClick={() => setFavorisOnly(!favorisOnly)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
            favorisOnly
              ? 'border-amber-400 bg-amber-500/10 text-amber-600'
              : 'border-border/60 text-muted-foreground hover:bg-muted/60',
          )}
        >
          <Star className={cn('h-3.5 w-3.5', favorisOnly && 'fill-amber-500')} />
          Favoris
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{total} enregistrement(s)</span>
      </div>

      {/* Barre d'action sélection multiple */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} sélectionné(s)</span>
          <Button size="sm" onClick={() => launch([...selected])} disabled={launching}>
            {launching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Lancer l'analyse ({selected.size})
          </Button>
        </div>
      )}

      {/* Tout sélectionner (page) */}
      {!loading && selectableKeys.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 pl-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={allSelected}
            onChange={() => (allSelected ? clearSelection() : selectAll(selectableKeys))}
          />
          Tout sélectionner (page)
        </label>
      )}

      {/* Liste de cards */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucun enregistrement coachable.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const inProgress = isInProgress(it.analysisStatus)
            const analyzed = it.analysisStatus === 'READY' && it.quality !== 'INEXPLOITABLE'
            const roleLabel = it.subjectRole === 'manager' ? 'mgr' : 'comm.'
            return (
              <li
                key={it.s3Key}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5',
                  it.favori && 'favori-glow',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary disabled:opacity-40"
                  checked={selected.has(it.s3Key)}
                  disabled={inProgress}
                  onChange={() => toggleSelect(it.s3Key)}
                  aria-label="Sélectionner"
                />
                <button
                  type="button"
                  onClick={() => toggleFavori(it.porteId, !it.favori)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-amber-500"
                  aria-label={it.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star
                    className={cn('h-4 w-4', it.favori && 'fill-amber-500 text-amber-500')}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {it.subjectName || '—'}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({roleLabel})
                    </span>
                    <span className="ml-2 font-normal text-muted-foreground">{it.adresse}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <PorteStatutPill statut={it.statutPorte} />
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(it.durationSec)}
                    </span>
                  </div>
                </div>

                <div className="w-24 shrink-0 text-right">
                  <AnalyseIndicator
                    status={it.analysisStatus}
                    quality={it.quality}
                    score={it.score}
                  />
                </div>

                <div className="w-24 shrink-0 text-right">
                  {inProgress ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : analyzed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDetail(it.analysisId)}
                    >
                      <Eye className="h-4 w-4" />
                      Voir
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => launch(it.s3Key)}
                      disabled={launching}
                    >
                      <Sparkles className="h-4 w-4" />
                      Lancer
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <CoachingDetailModal
        open={!!modalAnalysis || modalLoading}
        onOpenChange={(o) => {
          if (!o) setModalAnalysis(null)
        }}
        analysis={modalAnalysis}
      />
    </div>
  )
}
