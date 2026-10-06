import { Loader2 } from 'lucide-react'
import { useActiveReference } from './useActiveReference'
import ReferenceHeader from './ReferenceHeader'
import SalesPlanSteps from './SalesPlanSteps'

/** Onglet Plan de vente : le plan du référentiel actif, qui pilote le scoring. */
export default function SalesPlanViewer() {
  const { reference, loading, reload } = useActiveReference()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du plan de vente…
      </div>
    )
  }

  return (
    <div>
      <ReferenceHeader reference={reference} onChanged={reload} />
      {reference?.plan ? (
        <>
          <h3 className="mb-3 text-lg font-semibold">{reference.plan.title}</h3>
          <SalesPlanSteps steps={reference.plan.steps} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun plan de vente actif.</p>
      )}
    </div>
  )
}
