import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import BuildingTypeBadge from '@/components/BuildingTypeBadge'
import BuildingFacade from './BuildingFacade'

/**
 * Modale centrée affichant la façade d'un bâtiment (étages + portes). Réutilise
 * `BuildingFacade` ; l'en-tête porte le type + l'adresse (donc on ne repasse pas
 * `type` à la façade pour éviter un badge en double).
 */
export default function BuildingFacadeModal({ open, onOpenChange, facade }) {
  if (!facade) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b p-5 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {facade.type && <BuildingTypeBadge type={facade.type} />}
            <DialogTitle className="text-base font-semibold">
              {facade.address || 'Bâtiment'}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 shrink-0 p-0"
              onClick={() => onOpenChange?.(false)}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5">
          <BuildingFacade
            floors={facade.floors}
            address={facade.address}
            planSubtitle={facade.planSubtitle}
            // Depuis la fiche commercial on lit sa journée : l'heure prime sur l'étage.
            defaultView="chrono"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
