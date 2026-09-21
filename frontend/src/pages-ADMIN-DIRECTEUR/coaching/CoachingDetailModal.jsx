import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import CoachingDetail from './CoachingDetail'
import { useModalGeometry } from '@/hooks/ui/use-modal-geometry'

/** Modal de détail d'une analyse (ouvert depuis « Voir » du tableau de gestion). */
export default function CoachingDetailModal({ open, onOpenChange, analysis }) {
  const geometry = useModalGeometry()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[94vh] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        style={geometry}
      >
        {analysis ? (
          <CoachingDetail analysis={analysis} onClose={() => onOpenChange?.(false)} />
        ) : (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <DialogTitle className="sr-only">Analyse coaching</DialogTitle>
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
