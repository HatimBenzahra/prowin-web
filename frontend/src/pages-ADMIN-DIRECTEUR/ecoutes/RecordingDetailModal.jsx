import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AudioPlayer from '@/components/AudioPlayer'
import { RecordingService } from '@/services/audio'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingDetail from '@/pages-ADMIN-DIRECTEUR/coaching/CoachingDetail'
import { useModalGeometry } from '@/hooks/ui/use-modal-geometry'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import { ChevronLeft, ChevronRight, Download, Loader2, X, Sparkles, RefreshCw } from 'lucide-react'

/**
 * Détail d'un enregistrement de la Bibliothèque, dans une seule fenêtre dont le pied
 * (précédent / suivant, Télécharger) reste en place. S'il a déjà une analyse coaching
 * (prête, en cours ou échouée), le corps est `CoachingDetail`, qui suit l'avancement
 * et permet de relancer. Sinon, lecteur audio et lancement de l'analyse — proposé
 * seulement une fois l'absence d'analyse confirmée (`coachingStatus`).
 */
export default function RecordingDetailModal({
  open,
  onOpenChange,
  recording,
  analysis,
  coachingStatus,
  onRetryCoaching,
  onAnalysisLaunched,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  currentIndex,
  totalCount,
  onDownload,
}) {
  const geometry = useModalGeometry()
  const { showError, showWarning } = useErrorToast()
  const [streamingUrl, setStreamingUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [launching, setLaunching] = useState(false)

  const recordingKey = recording?.key
  const showAudio = open && Boolean(recordingKey) && !analysis

  useEffect(() => {
    if (!showAudio) {
      setStreamingUrl(null)
      return
    }
    let active = true
    setLoadingUrl(true)
    setStreamingUrl(null)
    RecordingService.getStreamingUrl(recordingKey)
      .then(url => {
        if (active) setStreamingUrl(url)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingUrl(false)
      })
    return () => {
      active = false
    }
  }, [showAudio, recordingKey])

  const launchCoaching = async () => {
    setLaunching(true)
    try {
      await CoachingService.launchMany([recordingKey])
      const [launched] = await CoachingService.byS3Keys([recordingKey])
      if (launched) onAnalysisLaunched?.(launched)
      else showWarning("L'analyse n'a pas pu être lancée pour cet enregistrement.")
    } catch (error) {
      showError(error, 'RecordingDetailModal.launchCoaching')
    } finally {
      setLaunching(false)
    }
  }

  if (!recording) return null

  const userName =
    recording.userName ||
    `${recording.userPrenom || ''} ${recording.userNom || ''}`.trim() ||
    'Utilisateur inconnu'

  const footer = (
    <div className="flex items-center justify-between border-t px-6 py-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="h-8 w-8 p-0"
          aria-label="Enregistrement précédent"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums px-1">
          {(currentIndex ?? 0) + 1} / {totalCount ?? 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          className="h-8 w-8 p-0"
          aria-label="Enregistrement suivant"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onDownload?.(recording)}
        className="gap-1.5"
      >
        <Download className="w-4 h-4" />
        Télécharger
      </Button>
    </div>
  )

  const coachingBlock =
    coachingStatus === 'resolved' ? (
      <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Pas encore de coaching pour cet enregistrement.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={launchCoaching}
          disabled={launching}
          className="shrink-0 gap-1.5"
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Lancer l'analyse
        </Button>
      </div>
    ) : coachingStatus === 'error' ? (
      <div className="flex flex-col gap-3 rounded-lg bg-destructive/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-destructive">
          Impossible de vérifier le coaching de cet enregistrement.
        </p>
        <Button variant="outline" size="sm" onClick={onRetryCoaching} className="shrink-0 gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Chargement du coaching…
      </div>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {analysis ? (
        <DialogContent
          className="flex h-[94vh] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
          style={geometry}
        >
          <CoachingDetail analysis={analysis} onClose={() => onOpenChange?.(false)} />
          {footer}
        </DialogContent>
      ) : (
        <DialogContent className="sm:max-w-3xl flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b">
            <div className="flex items-start gap-2 flex-wrap">
              <DialogTitle className="text-base font-semibold truncate max-w-xs sm:max-w-sm flex-1">
                {recording.filename}
              </DialogTitle>
              <Badge
                variant={recording.userType === 'manager' ? 'secondary' : 'outline'}
                className="text-[10px] px-1.5 py-0 h-5 shrink-0 self-center"
              >
                {recording.userType === 'manager' ? 'Manager' : 'Commercial'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0 ml-auto"
                onClick={() => onOpenChange?.(false)}
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {userName}
              {recording.date && (
                <span className="ml-2 text-muted-foreground/60">
                  · {recording.date} {recording.time && `à ${recording.time}`}
                </span>
              )}
            </p>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 flex-1">
            {loadingUrl && (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Préparation de la lecture...</span>
              </div>
            )}
            {!loadingUrl && streamingUrl && (
              <AudioPlayer
                src={streamingUrl}
                title={recording.filename}
                onDownload={() => onDownload?.(recording)}
              />
            )}
            {!loadingUrl && !streamingUrl && (
              <div className="flex items-center justify-center py-10">
                <p className="text-sm text-muted-foreground text-center">
                  L'URL de streaming n'est pas disponible pour cet enregistrement.
                </p>
              </div>
            )}

            {coachingBlock}

            <div className="grid w-fit grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t mx-auto justify-items-center">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Taille
                </p>
                <p className="text-sm font-medium">{recording.duration || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Date
                </p>
                <p className="text-sm font-medium">{recording.date || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Heure
                </p>
                <p className="text-sm font-medium">{recording.time || '—'}</p>
              </div>
            </div>
          </div>

          {footer}
        </DialogContent>
      )}
    </Dialog>
  )
}
