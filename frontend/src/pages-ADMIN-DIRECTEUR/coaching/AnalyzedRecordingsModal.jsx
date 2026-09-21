import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useModalGeometry } from '@/hooks/ui/use-modal-geometry'
import { Button } from '@/components/ui/button'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingDetail from './CoachingDetail'
import AnalyzedSessionsList from './AnalyzedSessionsList'

/**
 * Modal des enregistrements déjà analysés : liste → détail (vue unifiée
 * `CoachingDetail`), avec fil d'ariane « Analysés › … » et bouton retour.
 */
export default function AnalyzedRecordingsModal({ open, onOpenChange }) {
  const geometry = useModalGeometry()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!open) {
      setSelected(null)
      return
    }
    let active = true
    setLoading(true)
    CoachingService.analyses({ status: 'READY', take: 100 }).then(res => {
      if (!active) return
      setItems(res.items || [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[94vh] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        style={geometry}
      >
        {selected ? (
          <CoachingDetail
            analysis={selected}
            backLabel="Analysés"
            onBack={() => setSelected(null)}
            onClose={() => onOpenChange?.(false)}
          />
        ) : (
          <>
            <DialogHeader className="border-b p-5">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base">Enregistrements analysés</DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onOpenChange?.(false)}
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </div>
              ) : (
                <AnalyzedSessionsList items={items} onSelect={setSelected} />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
