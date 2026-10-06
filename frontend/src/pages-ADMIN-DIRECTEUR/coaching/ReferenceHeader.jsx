import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRole } from '@/contexts/userole'
import { formatDateTime } from './CoachingComponents'
import ReferenceHistorySheet from './ReferenceHistorySheet'
import ReferenceDraftSheet from './ReferenceDraftSheet'

/**
 * En-tête commun aux onglets Plan de vente et Produits : la version active du
 * référentiel, son historique et, pour l'admin, l'accès au brouillon.
 */
export default function ReferenceHeader({ reference, onChanged }) {
  const { isAdmin } = useRole()
  const [editing, setEditing] = useState(false)

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-2.5">
      <p className="text-sm">
        {reference ? (
          <>
            <span className="font-medium">Référentiel v{reference.version}</span>
            <span className="text-muted-foreground">
              {' '}
              · actif
              {reference.publishedAt &&
                ` · publié le ${formatDateTime(new Date(reference.publishedAt))}`}
              {reference.publishedBy && ` par ${reference.publishedBy}`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Aucun référentiel publié.</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ReferenceHistorySheet
          canEdit={isAdmin}
          refreshKey={reference?.id}
          onActivated={onChanged}
        />
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Modifier
          </Button>
        )}
      </div>
      {isAdmin && (
        <ReferenceDraftSheet open={editing} onOpenChange={setEditing} onPublished={onChanged} />
      )}
    </div>
  )
}
