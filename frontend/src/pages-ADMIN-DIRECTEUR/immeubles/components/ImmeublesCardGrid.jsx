import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Building, Plus } from 'lucide-react'
import ImmeubleCard from './ImmeubleCard'
import { paginateRows } from '../immeubles-display'

const GRID = 'grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

function EmptyState({ label = 'Aucun bâtiment' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-center">
      <Building className="h-5 w-5 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * Chargement incrémental : on n'affiche qu'un lot, et « Voir plus » en ajoute un.
 * Sans ça la grille montait tout d'un coup — plus de mille cards sur un patrimoine
 * réel, là où le tableau en paginait dix.
 *
 * Le compteur de lots repart de zéro dès que `rows` change d'identité, c'est-à-dire
 * à chaque changement de recherche, de filtre ou de tri : on ne reste jamais bloqué
 * sur un ancien lot.
 */
function usePaginated(rows) {
  const [batches, setBatches] = useState(1)

  useEffect(() => {
    setBatches(1)
  }, [rows])

  return {
    ...paginateRows(rows, batches),
    showMore: () => setBatches(current => current + 1),
  }
}

function CardGrid({ rows, canDelete, onDelete }) {
  const { visible, hasMore, total, showMore } = usePaginated(rows)

  if (total === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      <div className={GRID}>
        {visible.map(immeuble => (
          <ImmeubleCard
            key={immeuble.id}
            immeuble={immeuble}
            canDelete={canDelete}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {visible.length} sur {total} affiché{visible.length > 1 ? 's' : ''}
        </span>
        {hasMore && (
          <Button variant="outline" size="sm" onClick={showMore} className="gap-2">
            <Plus className="h-4 w-4" />
            Voir plus
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Section de quartier repliable : chevron, libellé et badge de comptage, puis la
 * grille de cards. Chaque groupe pagine indépendamment — paginer globalement à
 * travers des sections repliables n'aurait pas de sens.
 */
function GroupSection({ group, canDelete, onDelete }) {
  const [open, setOpen] = useState(true)
  const label = group.isAutonomes ? 'Autonomes' : group.label

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {group.data.length} bâtiment{group.data.length > 1 ? 's' : ''}
        </Badge>
      </button>
      {open && <CardGrid rows={group.data} canDelete={canDelete} onDelete={onDelete} />}
    </div>
  )
}

/** Les cards sont toujours organisées par quartier : c'est le principe de la vue. */
export default function ImmeublesCardGrid({ groups, canDelete, onDelete }) {
  if (!groups || groups.length === 0) return <EmptyState />

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <GroupSection key={group.key} group={group} canDelete={canDelete} onDelete={onDelete} />
      ))}
    </div>
  )
}
