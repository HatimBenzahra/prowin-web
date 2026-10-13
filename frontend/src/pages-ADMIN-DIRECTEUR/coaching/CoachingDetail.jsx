import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Clock, Loader2, RotateCw, Star, X } from 'lucide-react'
import { DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingResultPanel from './CoachingResultPanel'
import { ScoreSummary } from './CoachingOutcomeSections'
import {
  NIVEAU_LABELS,
  RELAUNCH_CORRECTION_WARNING,
  objectiveGap,
  showsScore,
} from './coaching-calibration'
import { ConfirmDialog } from './ReferenceDialogs'
import {
  BandPill,
  ScoreBar,
  StatusPill,
  QualityPill,
  PorteStatutPill,
  parseRecordingKey,
  formatDateTime,
  formatDuration,
  isInProgress,
} from './CoachingComponents'

// Cadence de suivi d'une analyse en cours, alignée sur les autres écrans coaching.
const POLL_MS = 6000

/**
 * Vue de détail d'une analyse coaching, UNIFIÉE (hors Dialog). Réutilisée par
 * tous les modaux : en-tête cohérent (fil d'ariane optionnel + titre + score +
 * favori + relancer + fermer) puis le corps `CoachingResultPanel`.
 * Autonome : gère localement le favori et le relancement.
 *
 * `embedded` : hors Dialog (panneau d'écoute de la page Coachings). L'hôte affiche
 * titre, porte, favori et lecteur ; il ne reste ici qu'un bloc de score unique et la
 * relance, puis le corps dans l'ordre du panneau.
 * `onSeek` : les horodatages des preuves calent le lecteur de l'hôte.
 * `onAnalysisChange` : chaque nouvel état (suivi, relance, correction) remonte à l'hôte.
 */
export default function CoachingDetail({
  analysis,
  onBack,
  onClose,
  backLabel = 'Analysés',
  embedded = false,
  onSeek,
  onAnalysisChange,
}) {
  const [a, setA] = useState(analysis)
  const [favori, setFavori] = useState(analysis?.favori ?? false)
  const [relaunching, setRelaunching] = useState(false)
  const [confirmRelaunch, setConfirmRelaunch] = useState(false)
  // Ref : le suivi en cours ne doit pas redémarrer quand l'hôte recrée son callback.
  const onChangeRef = useRef(onAnalysisChange)
  onChangeRef.current = onAnalysisChange
  const update = useCallback(next => {
    setA(next)
    onChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    setA(analysis)
    setFavori(analysis?.favori ?? false)
  }, [analysis])

  // Suit l'analyse en direct : sans ça, l'avancement ne bougeait qu'en fermant
  // puis réouvrant le modal, puisque la vue ne fait que suivre sa prop.
  const running = Boolean(a?.id && isInProgress(a.status))
  useEffect(() => {
    if (!running) return
    const t = setInterval(async () => {
      const fresh = await CoachingService.get(a.id)
      if (fresh) update(fresh)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [running, a?.id, update])

  if (!a) return null

  const meta = parseRecordingKey(a.s3KeyOriginal)
  const title = a.subjectName || meta.address || 'Enregistrement'
  const inProgress = isInProgress(a.status)
  const hasScore = showsScore(a.score, a.band)
  const gap = objectiveGap(a.score, a.objectiveScore, a.band)

  const toggleFavori = async () => {
    if (!a.porteId) return
    const next = !favori
    setFavori(next)
    try {
      await CoachingService.setFavori(a.porteId, next)
    } catch {
      setFavori(!next)
    }
  }
  const relaunch = async () => {
    setRelaunching(true)
    try {
      const updated = await CoachingService.relaunch(a.id)
      if (updated) update(updated)
    } finally {
      setRelaunching(false)
    }
  }

  const relaunchButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (a.outcomeOverriddenAt ? setConfirmRelaunch(true) : relaunch())}
      disabled={relaunching || inProgress}
    >
      {relaunching ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCw className="h-4 w-4" />
      )}
      Relancer
    </Button>
  )

  return (
    <>
      {embedded ? (
        <div className="border-b p-5">
          <ScoreSummary analysis={a} actions={relaunchButton} />
        </div>
      ) : (
        <div className="border-b p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              {onBack && (
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2"
                    onClick={onBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Retour
                  </Button>
                  <span className="shrink-0 text-muted-foreground">{backLabel}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              )}
              <DialogTitle className="truncate text-lg">{title}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
                {meta.address && meta.address !== title && <span>{meta.address}</span>}
                {meta.date && <span>{formatDateTime(meta.date)}</span>}
                {/* La durée n'existe qu'une fois l'audio transcrit. */}
                {typeof a.transcriptDurationSec === 'number' && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(a.transcriptDurationSec)}
                  </span>
                )}
                {a.status === 'READY' && a.planSlug && (
                  <span>
                    {a.planSlug} v{a.planVersion}
                  </span>
                )}
              </DialogDescription>
              {a.statutPorte && (
                <div className="mt-2">
                  <PorteStatutPill statut={a.statutPorte} />
                </div>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFavori}
                  className={cn(favori && 'border-amber-400 text-amber-600')}
                  aria-label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star className={cn('h-4 w-4', favori && 'fill-amber-500 text-amber-500')} />
                  Favori
                </Button>
                {relaunchButton}
                {onClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClose}
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={a.status} />
                <QualityPill quality={a.quality} />
              </div>
              {hasScore && (
                <div className="text-right">
                  <div className="text-3xl font-semibold leading-none">
                    {Math.round(a.score)}
                    <span className="text-base text-muted-foreground">/100</span>
                  </div>
                  {typeof a.confidence === 'number' && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      confiance {Math.round(a.confidence)}%
                    </div>
                  )}
                </div>
              )}
              {a.status === 'READY' && <BandPill score={a.score} band={a.band} />}
              {gap && (
                <div
                  className={cn(
                    'max-w-64 text-right text-xs',
                    gap.below ? 'font-medium text-amber-600' : 'text-muted-foreground'
                  )}
                >
                  {NIVEAU_LABELS[a.commercialNiveau] || a.commercialNiveau} · objectif{' '}
                  {a.objectiveScore}
                  {gap.below && ' — en dessous du standard attendu pour son niveau'}
                </div>
              )}
            </div>
          </div>
          {hasScore && <ScoreBar value={a.score} band={a.band} className="mt-3" />}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
        {/* Pas de pied de score : l'en-tête porte déjà score, barre et pastilles. */}
        <CoachingResultPanel
          analysis={a}
          recordingKey={a.s3KeyOriginal}
          showAudio={!embedded}
          embedded={embedded}
          onAnalysisChange={update}
          onSeek={onSeek}
        />
      </div>
      <ConfirmDialog
        open={confirmRelaunch}
        onOpenChange={setConfirmRelaunch}
        title="Relancer l’analyse ?"
        description={RELAUNCH_CORRECTION_WARNING}
        confirmLabel="Relancer"
        destructive
        onConfirm={relaunch}
      />
    </>
  )
}
