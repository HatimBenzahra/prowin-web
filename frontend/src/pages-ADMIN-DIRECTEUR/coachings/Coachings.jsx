import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Archive, Headphones, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { useIsMobile } from '@/hooks/ui/use-mobile'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import CoachingService from '@/services/coaching/coaching.service'
import { useActiveReference } from '../coaching/useActiveReference'
import CoachingsFilterBar from './CoachingsFilterBar'
import CoachingsTree from './CoachingsTree'
import CoachingsPanel from './CoachingsPanel'
import { useCoachingJournal } from './useCoachingJournal'
import {
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
  const { toast, dismiss } = useToast()

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

  /**
   * Archiver / désarchiver : la ligne quitte la vue courante. Si elle était
   * sélectionnée, la sélection passe à la suivante (la précédente en bout de liste).
   * Le toast propose d'annuler, qui remet la ligne et la sélection.
   */
  const toggleArchive = async row => {
    const archived = !row.archived
    const wasSelected = row.s3Key === selectedKey
    const rest = keys.filter(k => k !== row.s3Key)
    const index = keys.indexOf(row.s3Key)
    const nextKey = wasSelected ? (rest[Math.min(index, rest.length - 1)] ?? '') : selectedKey
    try {
      await journal.setArchived(row, archived)
    } catch (error) {
      showError(error, 'Coachings.toggleArchive')
      return
    }
    if (wasSelected) select(nextKey)
    const undo = async () => {
      dismiss(id)
      try {
        await CoachingService.setArchive(row.s3Key, row.archived)
        journal.restoreRow(row)
        if (wasSelected) select(row.s3Key)
      } catch (error) {
        showError(error, 'Coachings.undoArchive')
      }
    }
    const id = toast({
      variant: 'success',
      title: archived ? 'Enregistrement archivé' : 'Enregistrement désarchivé',
      description: archived
        ? 'Il n’apparaît plus dans le journal ; filtre « Archivés » pour le retrouver.'
        : 'Il est de retour dans le journal.',
      action: (
        <Button variant="outline" size="sm" className="h-7" onClick={undo}>
          Annuler
        </Button>
      ),
    })
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
      onToggleArchive={toggleArchive}
      onLaunch={journal.launch}
      onAnalysisChange={journal.setAnalysis}
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <Headphones className="h-10 w-10 text-muted-foreground/50" />
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
    // Deux colonnes sur toute la hauteur : à gauche titre, filtres et liste dans un même
    // cadre ; à droite l'écoute et le coaching, du haut en bas de la page.
    <div className="grid gap-4 lg:h-[calc(100svh-7rem)] lg:grid-cols-[minmax(380px,2fr)_3fr]">
      <div className="flex min-h-0 flex-col rounded-xl border bg-card">
        <div className="space-y-3 border-b p-3">
          <h1 className="text-lg font-semibold">Coachings</h1>
          <CoachingsFilterBar
            filters={filters}
            onChange={updateFilters}
            subjects={subjects}
            products={products}
            buildingLabel={buildingLabel}
          />
        </div>

        <div className="min-h-0 flex-1 lg:overflow-y-auto">
          {filters.archives && (
            <p className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <Archive className="h-3.5 w-3.5" />
              Enregistrements archivés (non intéressants) — « Désarchiver » les remet dans le
              journal.
            </p>
          )}
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
              onToggleArchive={toggleArchive}
              onFilterBuilding={immeubles => updateFilters({ immeubles })}
              launching={journal.launching}
              onLaunch={launchRow}
              hasMore={journal.hasMore}
              loadingMore={journal.loadingMore}
              onLoadMore={journal.loadMore}
            />
          )}
        </div>
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
  )
}
