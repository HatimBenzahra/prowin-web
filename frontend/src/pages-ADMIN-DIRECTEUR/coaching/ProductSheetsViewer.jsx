import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import CoachingService from '@/services/coaching/coaching.service'
import { useRole } from '@/contexts/userole'
import ProductSheetContent from './ProductSheetContent'
import { ReferenceHistorySheet, ReferenceImportButton } from './ReferenceVersionsPanel'

const ACTIVATION_DESCRIPTION =
  'Les prochaines analyses jugeront la conformité de ce produit avec cette version. Les analyses déjà faites gardent la leur.'

const renderSheet = version => (
  <div className="overflow-hidden rounded-xl border border-border/60">
    <ProductSheetContent sheet={version} />
  </div>
)
const sheetFileName = version => `${version.slug}.v${version.version}.md`

/** Historique d'une fiche ; la liste se charge avec la carte pour afficher son compte. */
function SheetHistory({ sheet, canEdit, onChanged }) {
  const loadVersions = useCallback(
    () => CoachingService.productSheetVersions(sheet.slug),
    [sheet.slug]
  )
  return (
    <ReferenceHistorySheet
      title={`Historique — ${sheet.label}`}
      loadVersions={loadVersions}
      loadVersion={CoachingService.productSheetVersion}
      renderContent={renderSheet}
      fileName={sheetFileName}
      onActivate={CoachingService.activateProductSheetVersion}
      canEdit={canEdit}
      activationDescription={ACTIVATION_DESCRIPTION}
      refreshKey={sheet.version}
      onActivated={onChanged}
    />
  )
}

/**
 * Fiches produit actives. Ce sont elles que le LLM oppose au discours du commercial
 * en passe 2 — avec le plan de vente. Une affirmation ne coûte des points que si elle
 * contredit les deux. L'admin importe une fiche ou réactive une ancienne version.
 */
export default function ProductSheetsViewer() {
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const { isAdmin } = useRole()

  const reload = useCallback(() => CoachingService.productSheets().then(setSheets), [])

  useEffect(() => {
    let active = true
    CoachingService.productSheets()
      .then(s => active && setSheets(s))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const importButton = isAdmin && (
    <ReferenceImportButton
      label="Importer une fiche"
      title="Importer une fiche produit ?"
      description="Nouvelle fiche, ou nouvelle version d'une fiche existante (même slug). Elle est validée puis activée pour les prochaines analyses."
      onImport={CoachingService.importProductSheet}
      onImported={reload}
    />
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des fiches produit…
      </div>
    )
  }
  if (sheets.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Aucune fiche produit active. Sans fiche, la conformité d'un produit n'est pas jugée.
        </p>
        {importButton}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Fiches produit</h3>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {sheets.length} fiche{sheets.length > 1 ? 's' : ''}
          </span>
          {importButton}
        </div>
      </div>

      <div className="space-y-2.5">
        {sheets.map(sheet => (
          <div key={sheet.slug} className="overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5">
              <span className="font-medium">{sheet.label}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
                v{sheet.version} · {sheet.productKey}
              </span>
            </div>

            <ProductSheetContent sheet={sheet} />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
              <SheetHistory sheet={sheet} canEdit={isAdmin} onChanged={reload} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Ces fiches versionnées sont le référentiel que l'analyse oppose au discours du commercial
        pour juger la conformité de ce qu'il a dit du produit.
      </p>
    </div>
  )
}
