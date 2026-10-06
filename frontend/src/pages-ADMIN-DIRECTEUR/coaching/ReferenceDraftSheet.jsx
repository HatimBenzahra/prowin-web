import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import CoachingService from '@/services/coaching/coaching.service'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { ConfirmDialog, MarkdownImportButton } from './ReferenceDialogs'
import { downloadMarkdown } from './download-markdown'
import ReferenceProductCard from './ReferenceProductCard'
import SalesPlanSteps from './SalesPlanSteps'
import ProductForm from './ProductForm'

/** Erreurs (bloquent la publication) puis alertes (choix à confirmer). */
function IssuesPanel({ issues }) {
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        Référentiel cohérent : prêt à publier.
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {[...errors, ...warnings].map((issue, i) => (
        <li
          key={i}
          className={
            issue.level === 'error'
              ? 'flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'
              : 'flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400'
          }
        >
          {issue.level === 'error' ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {issue.message}
        </li>
      ))}
    </ul>
  )
}

/**
 * Le brouillon du référentiel : on y remplace le plan, on gère le catalogue de produits
 * et leurs fiches, la validation du moteur s'affiche à chaque modification. Publier en
 * fait la version active ; abandonner le supprime.
 */
export default function ReferenceDraftSheet({ open, onOpenChange, onPublished }) {
  const [draft, setDraft] = useState(null)
  const [offres, setOffres] = useState([])
  const [form, setForm] = useState({ open: false, product: null })
  const [removing, setRemoving] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'publish' | 'discard' | 'remove'
  const { showError, showSuccess } = useErrorToast()

  useEffect(() => {
    if (!open) return
    let active = true
    Promise.all([CoachingService.openReferenceDraft(), CoachingService.coachingOffres()])
      .then(([state, list]) => {
        if (!active) return
        setDraft(state)
        setOffres(list)
      })
      .catch(error => active && showError(error, 'ReferenceDraftSheet.open'))
    return () => {
      active = false
    }
  }, [open, showError])

  const reference = draft?.reference
  const issues = draft?.issues ?? []
  const blocked = issues.some(i => i.level === 'error')

  const publish = async () => {
    const published = await CoachingService.publishReferenceDraft()
    showSuccess(`Référentiel v${published.version} publié : il note désormais les analyses.`)
    setDraft(null)
    onOpenChange(false)
    onPublished?.()
  }

  const discard = async () => {
    await CoachingService.discardReferenceDraft()
    showSuccess('Brouillon abandonné.')
    setDraft(null)
    onOpenChange(false)
  }

  const remove = async () => {
    setDraft(await CoachingService.removeReferenceDraftProduct(removing.key))
    showSuccess(`Produit « ${removing.label} » retiré du brouillon.`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>Brouillon du référentiel</SheetTitle>
          <SheetDescription>
            Modifiez le plan et les produits, puis publiez : les analyses déjà faites gardent leur
            version.
          </SheetDescription>
        </SheetHeader>

        {!reference ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ouverture du brouillon…
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            <IssuesPanel issues={issues} />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Plan de vente</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {reference.plan && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadMarkdown(`${reference.plan.slug}.md`, reference.plan.rawMarkdown)
                      }
                    >
                      <Download />
                      Plan (.md)
                    </Button>
                  )}
                  <MarkdownImportButton
                    label={reference.plan ? 'Remplacer le plan' : 'Importer le plan'}
                    title="Remplacer le plan de vente du brouillon ?"
                    description="Le plan est validé par le moteur ; les étapes produit doivent viser des produits du catalogue."
                    onImport={async markdown =>
                      setDraft(await CoachingService.setReferenceDraftPlan(markdown))
                    }
                    successMessage={name => `${name} : plan du brouillon remplacé.`}
                  />
                </div>
              </div>
              {reference.plan ? (
                <details className="rounded-xl border border-border/60">
                  <summary className="cursor-pointer px-4 py-2.5 text-sm">
                    <span className="font-medium">{reference.plan.title}</span>
                    <span className="ml-2 text-muted-foreground">
                      {reference.plan.steps.length} étapes
                    </span>
                  </summary>
                  <div className="border-t border-border/60 p-3">
                    <SalesPlanSteps steps={reference.plan.steps} />
                  </div>
                </details>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun plan : importez-en un.</p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Produits · {reference.products.length}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setForm({ open: true, product: null })}
                >
                  <Plus />
                  Ajouter un produit
                </Button>
              </div>
              {reference.products.map(product => (
                <ReferenceProductCard
                  key={product.key}
                  product={product}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm({ open: true, product })}
                      >
                        <Pencil />
                        Modifier
                      </Button>
                      {product.sheet && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            downloadMarkdown(`${product.key}.md`, product.sheet.rawMarkdown)
                          }
                        >
                          <Download />
                          Fiche (.md)
                        </Button>
                      )}
                      <MarkdownImportButton
                        variant="outline"
                        label={product.sheet ? 'Remplacer la fiche' : 'Importer la fiche'}
                        title={`Fiche de « ${product.label} » ?`}
                        description="La fiche ne contient que ce qui est autorisé (facts) et ce qui est surveillé (forbidden)."
                        onImport={async markdown =>
                          setDraft(
                            await CoachingService.setReferenceDraftProductSheet(
                              product.key,
                              markdown
                            )
                          )
                        }
                        successMessage={name =>
                          `${name} : fiche de « ${product.label} » enregistrée.`
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRemoving(product)
                          setConfirm('remove')
                        }}
                      >
                        <Trash2 />
                        Retirer
                      </Button>
                    </>
                  }
                />
              ))}
            </section>
          </div>
        )}

        {reference && (
          <SheetFooter className="flex-row justify-between border-t">
            <Button variant="ghost" onClick={() => setConfirm('discard')}>
              Abandonner le brouillon
            </Button>
            <Button disabled={blocked} onClick={() => setConfirm('publish')}>
              Publier
            </Button>
          </SheetFooter>
        )}
      </SheetContent>

      <ProductForm
        open={form.open}
        onOpenChange={next => setForm(current => ({ ...current, open: next }))}
        product={form.product}
        offres={offres}
        onSave={async fields => setDraft(await CoachingService.saveReferenceDraftProduct(fields))}
      />
      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={next => !next && setConfirm(null)}
        title="Publier le référentiel ?"
        description="Il devient la version active : les prochaines analyses et relances seront notées avec ce plan, ces produits et ces fiches."
        confirmLabel="Publier"
        onConfirm={publish}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={next => !next && setConfirm(null)}
        title="Abandonner le brouillon ?"
        description="Toutes ses modifications sont perdues. La version active ne change pas."
        confirmLabel="Abandonner"
        destructive
        onConfirm={discard}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={next => !next && setConfirm(null)}
        title={`Retirer « ${removing?.label} » du catalogue ?`}
        description="Possible seulement si aucune étape du plan ne vise ce produit. La version publiée n'est pas modifiée."
        confirmLabel="Retirer"
        destructive
        onConfirm={remove}
      />
    </Sheet>
  )
}
