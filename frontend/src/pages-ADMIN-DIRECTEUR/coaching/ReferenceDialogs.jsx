import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
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

/**
 * Briques communes de l'administration du référentiel coaching : confirmation,
 * import et téléchargement de markdown. Les écritures sont réservées à l'admin par
 * le serveur ; l'écran se contente de masquer les boutons.
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

/**
 * Choix d'un fichier .md puis confirmation ; le markdown part tel quel au serveur.
 * Un refus (document illisible) s'affiche dans le dialog, avec le message du moteur.
 */
export function MarkdownImportButton({
  label,
  title,
  description,
  confirmLabel = 'Importer',
  variant = 'default',
  onImport,
  successMessage,
}) {
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
    await onImport(await file.text())
    showSuccess(successMessage(file.name))
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
      <Button size="sm" variant={variant} onClick={() => inputRef.current?.click()}>
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
        confirmLabel={confirmLabel}
        onConfirm={importFile}
      />
    </>
  )
}
