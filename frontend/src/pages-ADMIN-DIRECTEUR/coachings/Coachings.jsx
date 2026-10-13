import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  DoorOpen,
  Gauge,
  Headphones,
  RotateCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { StatTile } from '@/components/details/DetailPrimitives'
import { useIsMobile } from '@/hooks/ui/use-mobile'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import CoachingService from '@/services/coaching/coaching.service'
import { useActiveReference } from '../coaching/useActiveReference'
import { BAND_META } from '../coaching/coaching-calibration'
import { BAND_TONE } from '../coaching/coaching-tones'
import CoachingsFilterBar from './CoachingsFilterBar'
import CoachingsTree from './CoachingsTree'
import CoachingsPanel from './CoachingsPanel'
import { useCoachingJournal } from './useCoachingJournal'
import {
  aggregate,
  groupRows,
  neighbourKey,
  parseFilters,
  serializeFilters,
  visibleKeys,
} from './coachings-utils'

/** Une frappe dans un champ ne doit jamais changer de porte. */
const isTyping = target =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    // Menus et listes déroulantes ouverts gardent leurs flèches ; l'arbre lui-même non.
    Boolean(target.closest('[role="menu"], [role="listbox"]:not([data-journal])')))

/**
 * Coachings : parcourir, écouter et lire le coaching au même endroit. À gauche le
 * journal (jour › bâtiment › portes), à droite le panneau d'écoute de la porte
 * sélectionnée — plus de modal qui fait perdre sa place dans la liste. Filtres,
 * vue et sélection vivent dans l'URL : un lien partagé rouvre la même écoute.
 */
export default function Coachings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  const selectedKey = searchParams.get('s') || ''
  const isMobile = useIsMobile()
  const { showError } = useErrorToast()

  // La vue ne change que le regroupement, pas la requête.
  const serverFilters = useMemo(() => ({ ...filters, group: undefined }), [filters])
  const journal = useCoachingJournal(serverFilters)
  const { reference } = useActiveReference()
  const products = reference?.products ?? []
  const [subjects, setSubjects] = useState([])
  const [collapsed, setCollapsed] = useState(() => new Set())

  useEffect(() => {
    CoachingService.coachableSubjects().then(setSubjects)
  }, [])

  const updateFilters = useCallback(
    patch =>
      setSearchParams(serializeFilters({ ...filters, ...patch }, selectedKey), { replace: true }),
    [filters, selectedKey, setSearchParams]
  )
  const select = useCallback(
    key => setSearchParams(serializeFilters(filters, key || ''), { replace: true }),
    [filters, setSearchParams]
  )

  const tree = useMemo(() => groupRows(journal.rows, filters.group), [journal.rows, filters.group])
  const keys = useMemo(() => visibleKeys(tree, collapsed), [tree, collapsed])
  const selectedRow = journal.rows.find(r => r.s3Key === selectedKey) ?? null
  const kpis = useMemo(() => {
    const rows = journal.rows
    return {
      ...aggregate(rows),
      nbPretes: rows.filter(r => r.analysis?.status === 'READY').length,
      nbSansAnalyse: rows.filter(r => !r.analysis).length,
    }
  }, [journal.rows])

  const toggleCollapse = key =>
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleFavori = async row => {
    try {
      await journal.setFavori(row.porteId, !row.favori)
    } catch (error) {
      showError(error, 'Coachings.toggleFavori')
    }
  }

  const launchRow = async row => {
    try {
      await journal.launch(row.s3Key)
    } catch (error) {
      showError(error, 'Coachings.launch')
    }
  }

  // Libellé du filtre bâtiment : l'adresse si une ligne chargée la connaît.
  const buildingLabel = filters.immeubles.length
    ? (journal.rows.find(r => filters.immeubles.includes(r.immeubleId))?.adresse ?? 'Bâtiment')
    : null

  // ↑/↓ ou J/K : porte précédente / suivante, chargée dans le panneau.
  // (Espace lecture/pause est géré par le lecteur lui-même.)
  useEffect(() => {
    const onKeyDown = e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
      const step = { ArrowDown: 1, j: 1, J: 1, ArrowUp: -1, k: -1, K: -1 }[e.key]
      if (!step) return
      const next = neighbourKey(keys, selectedKey, step)
      if (!next) return
      e.preventDefault()
      if (next !== selectedKey) select(next)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [keys, selectedKey, select])

  const panel = selectedKey ? (
    <CoachingsPanel
      key={selectedKey}
      s3Key={selectedKey}
      row={selectedRow}
      onClose={isMobile ? undefined : () => select('')}
      onToggleFavori={toggleFavori}
      onLaunch={journal.launch}
      onAnalysisChange={journal.setAnalysis}
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Headphones className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Sélectionnez une porte pour l’écouter</p>
        <p className="mt-1 text-xs">
          <kbd className="rounded border px-1">↑</kbd> <kbd className="rounded border px-1">↓</kbd>{' '}
          ou <kbd className="rounded border px-1">J</kbd>{' '}
          <kbd className="rounded border px-1">K</kbd> pour passer d’une porte à l’autre,{' '}
          <kbd className="rounded border px-1">Espace</kbd> pour lire.
        </p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100svh-7rem)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Coachings</h1>
            <p className="text-sm text-muted-foreground">
              Toutes les écoutes par jour et par bâtiment, avec leur coaching IA.
            </p>
          </div>
        </div>
        <CoachingsKpis kpis={kpis} loading={journal.loading} partial={journal.hasMore} />
      </div>

      <CoachingsFilterBar
        filters={filters}
        onChange={updateFilters}
        subjects={subjects}
        products={products}
        buildingLabel={buildingLabel}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(340px,2fr)_3fr]">
        <div className="min-h-0 rounded-xl border bg-card lg:overflow-y-auto">
          {journal.loading ? (
            <div className="space-y-3 p-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ))}
            </div>
          ) : journal.error && !journal.rows.length ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Impossible de charger les écoutes.</p>
              <Button variant="outline" size="sm" onClick={journal.reload}>
                <RotateCw className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          ) : !journal.rows.length ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Headphones className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Aucun enregistrement</p>
              <p className="text-sm text-muted-foreground">
                Élargissez la période ou retirez des filtres.
              </p>
            </div>
          ) : (
            <CoachingsTree
              tree={tree}
              groupBy={filters.group}
              selectedKey={selectedKey}
              onSelect={select}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onToggleFavori={toggleFavori}
              onFilterBuilding={immeubles => updateFilters({ immeubles })}
              launching={journal.launching}
              onLaunch={launchRow}
              hasMore={journal.hasMore}
              loadingMore={journal.loadingMore}
              onLoadMore={journal.loadMore}
            />
          )}
        </div>

        {/* Panneau latéral (pas un modal) ; sous lg, un tiroir plein écran. */}
        {isMobile ? (
          <Sheet open={Boolean(selectedKey)} onOpenChange={open => !open && select('')}>
            <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
              <SheetTitle className="sr-only">Écoute</SheetTitle>
              {/* Sous la croix du tiroir. */}
              {selectedKey && <div className="pt-10">{panel}</div>}
            </SheetContent>
          </Sheet>
        ) : (
          <div className="min-h-0 overflow-y-auto rounded-xl border bg-card">{panel}</div>
        )}
      </div>
    </div>
  )
}

/**
 * Les chiffres de la fenêtre affichée, calculés sur les lignes chargées : tant que
 * des jours restent à charger, l'indice le dit plutôt que de laisser croire au total.
 */
function CoachingsKpis({ kpis, loading, partial }) {
  const scope = partial ? 'Jours chargés' : 'Sur la période'
  const show = value => (loading ? '—' : value)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[720px] xl:shrink-0">
      <StatTile
        size="sm"
        icon={DoorOpen}
        accent="blue"
        label="Portes écoutées"
        value={show(kpis.nbPortes)}
        hint={scope}
      />
      <StatTile
        size="sm"
        icon={Sparkles}
        accent="violet"
        label="Analysées"
        value={show(kpis.nbPretes)}
        hint={
          kpis.nbSansAnalyse > 0
            ? `${kpis.nbSansAnalyse} à analyser`
            : `${kpis.nbAnalyses} notée${kpis.nbAnalyses > 1 ? 's' : ''}`
        }
      />
      <StatTile
        size="sm"
        icon={Gauge}
        accent="amber"
        label="Score moyen"
        value={show(
          kpis.scoreMoyen == null
            ? '—'
            : kpis.scoreMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
        )}
        valueClassName={!loading && kpis.band ? BAND_TONE[kpis.band].text : undefined}
        hint={kpis.band ? BAND_META[kpis.band].label : 'Aucune analyse notée'}
      />
      <StatTile
        size="sm"
        icon={Trophy}
        accent="emerald"
        label="Ventes"
        value={show(kpis.nbVentes)}
        hint="Signées ou vente IA"
      />
    </div>
  )
}
