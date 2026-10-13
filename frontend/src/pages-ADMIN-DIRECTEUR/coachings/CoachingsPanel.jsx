import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Clock, Loader2, Sparkles, Star, User2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import AudioPlayer from '@/components/AudioPlayer'
import { cn } from '@/lib/utils'
import { useErrorToast } from '@/hooks/utils/ui/use-error-toast'
import CoachingService from '@/services/coaching/coaching.service'
import RecordingService from '@/services/audio/recordings/recording.service'
import CoachingDetail from '../coaching/CoachingDetail'
import {
  PorteStatutPill,
  formatDateTime,
  formatDuration,
  parseRecordingKey,
} from '../coaching/CoachingComponents'
import { porteLabel } from './coachings-utils'

/**
 * Panneau d'écoute de la porte sélectionnée : en-tête, lecteur compact épinglé
 * (il reste en vue pendant la lecture du coaching), puis le détail d'analyse
 * existant, ou de quoi lancer l'analyse. Les horodatages des preuves calent le lecteur.
 *
 * `row` peut manquer (lien partagé vers un audio hors de la période chargée) :
 * l'en-tête retombe alors sur ce que dit la clé S3.
 */
export default function CoachingsPanel({
  s3Key,
  row,
  onClose,
  onToggleFavori,
  onToggleArchive,
  onLaunch,
  onAnalysisChange,
}) {
  const { showError } = useErrorToast()
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioError, setAudioError] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [launching, setLaunching] = useState(false)
  const wsRef = useRef(null)
  const pendingSeek = useRef(null)
  const analysisId = row?.analysis?.id ?? null

  useEffect(() => {
    let active = true
    setAudioUrl(null)
    setAudioError(false)
    wsRef.current = null
    RecordingService.getStreamingUrl(s3Key)
      .then(url => active && (url ? setAudioUrl(url) : setAudioError(true)))
      .catch(() => active && setAudioError(true))
    return () => {
      active = false
    }
  }, [s3Key])

  useEffect(() => {
    let active = true
    setAnalysis(null)
    if (!analysisId) return
    setLoadingAnalysis(true)
    CoachingService.get(analysisId)
      .then(a => active && setAnalysis(a))
      .finally(() => active && setLoadingAnalysis(false))
    return () => {
      active = false
    }
  }, [analysisId])

  const onWavesurferReady = useCallback(ws => {
    wsRef.current = ws
    if (pendingSeek.current != null) {
      ws.setTime(pendingSeek.current)
      ws.play()
      pendingSeek.current = null
    }
  }, [])

  // Une preuve cliquée avant la fin du chargement est rejouée dès que le lecteur est prêt.
  const seek = useCallback(sec => {
    const ws = wsRef.current
    if (!ws) {
      pendingSeek.current = sec
      return
    }
    ws.setTime(sec)
    ws.play()
  }, [])

  const launch = async () => {
    setLaunching(true)
    try {
      const created = await onLaunch(s3Key)
      if (created) setAnalysis(created)
    } catch (error) {
      showError(error, 'CoachingsPanel.launch')
    } finally {
      setLaunching(false)
    }
  }

  const meta = parseRecordingKey(s3Key)
  const date = row ? new Date(row.createdAt) : meta.date

  return (
    <div>
      <div className="bg-sidebar p-4 pb-3 text-sidebar-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {row?.adresse || meta.address || 'Enregistrement'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-sidebar-foreground/75 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
              {row && (
                <span className="font-medium text-sidebar-foreground">{porteLabel(row)}</span>
              )}
              {row?.subjectName && (
                <span className="inline-flex items-center gap-1">
                  <User2 className="h-3.5 w-3.5" />
                  {row.subjectName}
                </span>
              )}
              {date && <span>{formatDateTime(date)}</span>}
              {row?.durationSec > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(row.durationSec)}
                </span>
              )}
            </div>
            {row?.statutPorte && (
              <div className="mt-2">
                <PorteStatutPill statut={row.statutPorte} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {row && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleFavori(row)}
                className={cn(
                  'border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  row.favori ? 'border-amber-400 text-amber-300' : 'border-sidebar-foreground/30'
                )}
                aria-label={row.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <Star className={cn('h-4 w-4', row.favori && 'fill-amber-500 text-amber-500')} />
                Favori
              </Button>
            )}
            {row && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleArchive(row)}
                className="border border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title={
                  row.archived
                    ? 'Remettre dans le journal'
                    : 'Masquer cet enregistrement (non intéressant)'
                }
              >
                {row.archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {row.archived ? 'Désarchiver' : 'Archiver'}
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={onClose}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Épinglé : les commandes restent en vue pendant qu'on clique les preuves. */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 pb-2">
        {audioUrl ? (
          <AudioPlayer
            src={audioUrl}
            title="Enregistrement"
            onWavesurferReady={onWavesurferReady}
            compact
          />
        ) : audioError ? (
          <p className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Audio indisponible pour cet enregistrement.
          </p>
        ) : (
          <Skeleton className="h-[96px] w-full" />
        )}
      </div>

      {analysisId ? (
        analysis ? (
          <CoachingDetail
            analysis={analysis}
            embedded
            onSeek={seek}
            onAnalysisChange={next => onAnalysisChange(s3Key, next)}
          />
        ) : loadingAnalysis ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">Analyse introuvable.</p>
        )
      ) : (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium">Pas encore analysé</p>
            <p className="text-sm text-muted-foreground">
              Lancez le coaching IA pour obtenir le score et le déroulé du plan de vente.
            </p>
          </div>
          <Button size="sm" onClick={launch} disabled={launching}>
            {launching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Analyser
          </Button>
        </div>
      )}
    </div>
  )
}
