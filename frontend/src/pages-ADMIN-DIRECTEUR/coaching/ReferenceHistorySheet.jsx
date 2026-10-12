import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Eye, History, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import CoachingService from '@/services/coaching/coaching.service'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { formatDateTime } from './CoachingComponents'
import { ConfirmDialog } from './ReferenceDialogs'
import { downloadMarkdown } from './download-markdown'
import ReferenceContent from './ReferenceContent'

const ACTIVATION_DESCRIPTION =
  'Les prochaines analyses et relances seront notées avec cette version (plan, produits et fiches). Les analyses déjà faites gardent la leur.'

/**
 * Historique du référentiel dans un panneau latéral : les versions publiées, puis la
 * lecture complète de l'une d'elles avant de la réactiver.
 */
export default function ReferenceHistorySheet({ canEdit, refreshKey, onActivated }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState([])
  const [detail, setDetail] = useState(null)
  const [loadingId, setLoadingId] = useState(null)
  const [target, setTarget] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const { showError, showSuccess } = useErrorToast()

  useEffect(() => {
    let active = true
    CoachingService.referenceVersions()
      .then(rows => active && setVersions(rows))
      .catch(error => active && showError(error, 'ReferenceHistorySheet.load'))
    return () => {
      active = false
    }
  }, [refreshKey, showError])

  const openVersion = async version => {
    setLoadingId(version.id)
    try {
      setDetail(await CoachingService.referenceVersion(version.id))
    } catch (error) {
      showError(error, 'ReferenceHistorySheet.open')
    } finally {
      setLoadingId(null)
    }
  }

  const askActivation = version => {
    setTarget(version)
    setConfirming(true)
  }

  const activate = async () => {
    await CoachingService.activateReferenceVersion(target.id)
    showSuccess(`Référentiel v${target.version} réactivé.`)
    setDetail(null)
    onActivated?.()
  }

  const changeOpen = next => {
    setOpen(next)
    if (!next) setDetail(null)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <History />
        Historique · {versions.length}
      </Button>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent className="w-full gap-0 sm:max-w-3xl">
          <SheetHeader className="border-b">
            <SheetTitle>Historique du référentiel</SheetTitle>
            <SheetDescription>
              {detail
                ? `Référentiel v${detail.version} — consultation`
                : `${versions.length} version${versions.length > 1 ? 's' : ''} publiée${versions.length > 1 ? 's' : ''}, la plus récente en premier`}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {detail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
                    <ArrowLeft />
                    Historique
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.plan && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadMarkdown(
                            `${detail.plan.slug}.v${detail.version}.md`,
                            detail.plan.rawMarkdown
                          )
                        }
                      >
                        <Download />
                        Plan (.md)
                      </Button>
                    )}
                    {canEdit && !detail.isActive && (
                      <Button size="sm" onClick={() => askActivation(detail)}>
                        Réactiver cette version
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd>
                    <span className="font-mono font-medium">v{detail.version}</span>{' '}
                    <span className="text-muted-foreground">
                      {detail.isActive ? '· active' : '· ancienne version'}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">Publiée le</dt>
                  <dd>{detail.publishedAt ? formatDateTime(new Date(detail.publishedAt)) : '—'}</dd>
                  <dt className="text-muted-foreground">Par</dt>
                  <dd>{detail.publishedBy || '—'}</dd>
                  <dt className="text-muted-foreground">Empreinte</dt>
                  <dd className="font-mono text-xs leading-5">{detail.contentHash}</dd>
                </dl>
                <ReferenceContent reference={detail} />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Version</th>
                    <th className="py-2 pr-3 font-medium">Publiée le</th>
                    <th className="py-2 pr-3 font-medium">Par</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-border/60">
                  {versions.map(v => (
                    <tr key={v.id}>
                      <td className="py-2 pr-3">
                        <span className="font-mono font-medium">v{v.version}</span>
                        {v.isActive && (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
                            active
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {v.publishedAt ? formatDateTime(new Date(v.publishedAt)) : '—'}
                      </td>
                      <td className="max-w-[12rem] truncate py-2 pr-3 text-muted-foreground">
                        {v.publishedBy || '—'}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={loadingId !== null}
                          onClick={() => openVersion(v)}
                        >
                          {loadingId === v.id ? <Loader2 className="animate-spin" /> : <Eye />}
                          Voir
                        </Button>
                        {canEdit && !v.isActive && (
                          <Button size="sm" variant="outline" onClick={() => askActivation(v)}>
                            Réactiver
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Réactiver le référentiel v${target?.version} ?`}
        description={ACTIVATION_DESCRIPTION}
        confirmLabel="Réactiver"
        onConfirm={activate}
      />
    </>
  )
}
