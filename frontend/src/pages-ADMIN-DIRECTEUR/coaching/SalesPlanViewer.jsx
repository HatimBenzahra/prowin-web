import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import CoachingService from '@/services/coaching/coaching.service'
import { useRole } from '@/contexts/userole'
import { ReferenceHistorySheet, ReferenceImportButton } from './ReferenceVersionsPanel'
import SalesPlanSteps from './SalesPlanSteps'

const IMPORT_DESCRIPTION =
  'Le plan est validé puis activé : les prochaines analyses et relances seront notées avec lui. Les analyses déjà faites gardent leur version.'

const ACTIVATION_DESCRIPTION =
  'Les prochaines analyses et relances seront notées avec cette version. Les analyses déjà faites gardent la leur.'

const renderPlan = version => <SalesPlanSteps steps={version.steps} />
const planFileName = version => `${version.slug}.v${version.version}.md`

export default function SalesPlanViewer() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const { isAdmin } = useRole()
  const slug = plan?.slug
  const loadVersions = useCallback(() => CoachingService.salesPlanVersions(slug), [slug])

  useEffect(() => {
    let active = true
    CoachingService.activePlan()
      .then(p => active && setPlan(p))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du plan de vente…
      </div>
    )
  }
  const importButton = isAdmin && (
    <ReferenceImportButton
      label="Importer une version"
      title="Importer un plan de vente ?"
      description={IMPORT_DESCRIPTION}
      onImport={CoachingService.importSalesPlan}
      onImported={setPlan}
    />
  )

  if (!plan) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Aucun plan de vente actif.</p>
        {importButton}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{plan.title}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
            v{plan.version} · actif
          </span>
          <ReferenceHistorySheet
            title="Historique du plan de vente"
            loadVersions={loadVersions}
            loadVersion={CoachingService.salesPlanVersion}
            renderContent={renderPlan}
            fileName={planFileName}
            onActivate={CoachingService.activateSalesPlanVersion}
            canEdit={isAdmin}
            activationDescription={ACTIVATION_DESCRIPTION}
            refreshKey={plan.version}
            onActivated={setPlan}
          />
          {importButton}
        </div>
      </div>
      <SalesPlanSteps steps={plan.steps} />
      <p className="mt-4 rounded-lg border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Le plan de vente actif pilote le scoring. Chaque import crée une version ; un contenu
        identique à une version existante la réactive simplement.
      </p>
    </div>
  )
}
