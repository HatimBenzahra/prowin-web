import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CoachingService from '@/services/coaching/coaching.service'
import { useRole } from '@/contexts/userole'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { SeverityPill } from './CoachingComponents'
import {
  ConfirmDialog,
  ReferenceImportButton,
  ReferenceVersionHistory,
} from './ReferenceVersionsPanel'

const ACTIVATION_DESCRIPTION =
  'Les prochaines analyses jugeront la conformité de ce produit avec cette version. Les analyses déjà faites gardent la leur.'

/** Historique d'une fiche, chargé à l'ouverture seulement. */
function SheetHistory({ sheet, canEdit, onChanged }) {
  const loadVersions = useCallback(
    () => CoachingService.productSheetVersions(sheet.slug),
    [sheet.slug]
  )
  return (
    <ReferenceVersionHistory
      loadVersions={loadVersions}
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
 * contredit les deux. L'admin importe, réactive ou retire une fiche.
 */
export default function ProductSheetsViewer() {
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [openHistory, setOpenHistory] = useState(null)
  const [retiring, setRetiring] = useState(null)
  const [confirmingRetire, setConfirmingRetire] = useState(false)
  const { isAdmin } = useRole()
  const { showSuccess } = useErrorToast()

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

  const retire = async () => {
    await CoachingService.deactivateProductSheet(retiring.slug)
    showSuccess(`Fiche ${retiring.label} retirée.`)
    await reload()
  }

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

            <div className="px-4 py-3">
              <h4 className="mb-1.5 text-sm font-semibold">Ce que le commercial peut affirmer</h4>
              <ul className="space-y-1">
                {(sheet.facts || []).map((fact, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>

            {(sheet.forbidden || []).length > 0 && (
              <div className="border-t border-dashed border-border/60 px-4 py-3">
                <h4 className="mb-1.5 text-sm font-semibold">Affirmations surveillées</h4>
                <ul className="space-y-1.5">
                  {sheet.forbidden.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <SeverityPill severity={f.severity} />
                      <span className="text-foreground/90">« {f.say} »</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpenHistory(openHistory === sheet.slug ? null : sheet.slug)}
              >
                <ChevronDown className={openHistory === sheet.slug ? 'rotate-180' : ''} />
                Historique
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRetiring(sheet)
                    setConfirmingRetire(true)
                  }}
                >
                  Retirer la fiche
                </Button>
              )}
            </div>
            {openHistory === sheet.slug && (
              <div className="border-t border-dashed border-border/60">
                <SheetHistory sheet={sheet} canEdit={isAdmin} onChanged={reload} />
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmingRetire}
        onOpenChange={setConfirmingRetire}
        title={`Retirer la fiche ${retiring?.label} ?`}
        description="Plus aucune version ne sera active : la conformité de ce produit ne sera plus jugée dans les prochaines analyses. La fiche reste réactivable depuis un nouvel import."
        confirmLabel="Retirer"
        destructive
        onConfirm={retire}
      />

      <p className="mt-4 rounded-lg border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Ces fiches versionnées sont le référentiel que l'analyse oppose au discours du commercial
        pour juger la conformité de ce qu'il a dit du produit.
      </p>
    </div>
  )
}
