import { useEffect, useRef, useState } from 'react'
import { History, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { formatDateTime } from './CoachingComponents'

/**
 * Administration des référentiels du coaching (plan de vente, fiches produit) :
 * import d'un markdown, historique des versions, réactivation. Les écritures sont
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

/** Versions d'un référentiel, la plus récente d'abord, réactivables par l'admin. */
export function ReferenceVersionHistory({
  loadVersions,
  onActivate,
  canEdit,
  activationDescription,
  refreshKey,
  onActivated,
}) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const { showError, showSuccess } = useErrorToast()

  useEffect(() => {
    let active = true
    setLoading(true)
    loadVersions()
      .then(rows => active && setVersions(rows))
      .catch(error => active && showError(error, 'ReferenceVersionHistory.load'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadVersions, refreshKey, showError])

  const activate = async () => {
    const result = await onActivate(target.id)
    showSuccess(`Version ${target.version} réactivée.`)
    onActivated?.(result)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de l'historique…
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <History className="h-4 w-4" />
        Historique des versions
      </h4>
      <ul className="divide-y divide-dashed divide-border/60 text-sm">
        {versions.map(v => (
          <li
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono font-medium">v{v.version}</span>
              <span className="text-muted-foreground">{formatDateTime(new Date(v.createdAt))}</span>
              <span className="truncate text-muted-foreground">{v.importedBy || '—'}</span>
              <span className="font-mono text-xs text-muted-foreground/70">{v.contentHash}</span>
            </span>
            {v.isActive ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
                active
              </span>
            ) : (
              canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTarget(v)
                    setConfirming(true)
                  }}
                >
                  Réactiver
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Réactiver la version ${target?.version} ?`}
        description={activationDescription}
        confirmLabel="Réactiver"
        onConfirm={activate}
      />
    </div>
  )
}
