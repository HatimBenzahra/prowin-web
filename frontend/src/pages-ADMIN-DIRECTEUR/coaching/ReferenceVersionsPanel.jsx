import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, Eye, History, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { formatDateTime } from './CoachingComponents'

/**
 * Administration des référentiels du coaching (plan de vente, fiches produit) :
 * import d'un markdown, historique et lecture des versions, réactivation. Les écritures sont
 * réservées à l'admin par le serveur ; l'écran se contente de masquer les boutons.
 */

/** Le message serveur tel quel : pour un import refusé, c'est celui du parseur. */
const errorMessage = error => error?.message || 'Action impossible.'

/** Confirmation d'une action qui change la notation des prochaines analyses. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={confirm}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Choix d'un fichier .md puis confirmation ; le markdown part tel quel au serveur. */
export function ReferenceImportButton({ label, title, description, onImport, onImported }) {
  const inputRef = useRef(null)
  // Le sujet reste en place après fermeture : le dialog garde son texte pendant l'animation.
  const [file, setFile] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const { showSuccess } = useErrorToast()

  const pick = event => {
    const chosen = event.target.files?.[0]
    // Réinitialisé pour pouvoir re-choisir le même fichier après une correction.
    event.target.value = ''
    if (chosen) {
      setFile(chosen)
      setConfirming(true)
    }
  }

  const importFile = async () => {
    const result = await onImport(await file.text())
    showSuccess(`${file.name} importé : version ${result.version} active.`)
    onImported?.(result)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={pick}
      />
      <Button size="sm" onClick={() => inputRef.current?.click()}>
        <Upload />
        {label}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={title}
        description={
          <>
            <span className="font-mono text-foreground">{file?.name}</span>
            <br />
            {description}
          </>
        }
        confirmLabel="Importer et activer"
        onConfirm={importFile}
      />
    </>
  )
}

/** Télécharge le markdown d'une version, pour la corriger puis la réimporter. */
function downloadMarkdown(fileName, markdown) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  // Attaché au document le temps du clic : certains navigateurs l'exigent.
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Historique d'un référentiel dans un panneau latéral : la liste des versions, puis
 * la lecture de l'une d'elles (rendu structuré ou markdown source) avant de la
 * réactiver. La page, elle, ne montre que la version active.
 */
export function ReferenceHistorySheet({
  title,
  loadVersions,
  loadVersion,
  renderContent,
  fileName,
  onActivate,
  canEdit,
  activationDescription,
  refreshKey,
  onActivated,
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState([])
  const [detail, setDetail] = useState(null)
  const [loadingId, setLoadingId] = useState(null)
  const [view, setView] = useState('lecture')
  const [target, setTarget] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const { showError, showSuccess } = useErrorToast()

  useEffect(() => {
    let active = true
    loadVersions()
      .then(rows => active && setVersions(rows))
      .catch(error => active && showError(error, 'ReferenceHistorySheet.load'))
    return () => {
      active = false
    }
  }, [loadVersions, refreshKey, showError])

  const openVersion = async version => {
    setLoadingId(version.id)
    try {
      setDetail(await loadVersion(version.id))
      setView('lecture')
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
    const result = await onActivate(target.id)
    showSuccess(`Version ${target.version} réactivée.`)
    setDetail(null)
    onActivated?.(result)
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
        <SheetContent className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {detail
                ? `Version ${detail.version} — consultation`
                : `${versions.length} version${versions.length > 1 ? 's' : ''}, la plus récente en premier`}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {detail ? (
              <VersionDetail
                detail={detail}
                view={view}
                onViewChange={setView}
                renderContent={renderContent}
                onBack={() => setDetail(null)}
                onDownload={() => downloadMarkdown(fileName(detail), detail.rawMarkdown)}
                onActivate={canEdit && !detail.isActive ? () => askActivation(detail) : null}
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Version</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Importé par</th>
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
                        {formatDateTime(new Date(v.createdAt))}
                      </td>
                      <td className="max-w-[12rem] truncate py-2 pr-3 text-muted-foreground">
                        {v.importedBy || '—'}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
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
        title={`Réactiver la version ${target?.version} ?`}
        description={activationDescription}
        confirmLabel="Réactiver"
        onConfirm={activate}
      />
    </>
  )
}

/** Une version ouverte : métadonnées, contenu lisible ou markdown source, actions. */
function VersionDetail({
  detail,
  view,
  onViewChange,
  renderContent,
  onBack,
  onDownload,
  onActivate,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Historique
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDownload}>
            <Download />
            Télécharger le .md
          </Button>
          {onActivate && (
            <Button size="sm" onClick={onActivate}>
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
        <dt className="text-muted-foreground">Importée le</dt>
        <dd>{formatDateTime(new Date(detail.createdAt))}</dd>
        <dt className="text-muted-foreground">Par</dt>
        <dd>{detail.importedBy || '—'}</dd>
        <dt className="text-muted-foreground">Empreinte</dt>
        <dd className="font-mono text-xs leading-5">{detail.contentHash}</dd>
      </dl>

      <Tabs value={view} onValueChange={onViewChange}>
        <TabsList>
          <TabsTrigger value="lecture">Lecture</TabsTrigger>
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
        </TabsList>
        <TabsContent value="lecture" className="pt-3">
          {renderContent(detail)}
        </TabsContent>
        <TabsContent value="markdown" className="pt-3">
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {detail.rawMarkdown}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
