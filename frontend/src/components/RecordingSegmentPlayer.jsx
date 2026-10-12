import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Mic, PlayCircle } from 'lucide-react'
import AudioPlayer from '@/components/AudioPlayer'
import { RecordingService } from '@/services/audio'
import { getStatusColor, getStatusLabel } from '@/constants/domain/porte-status'
import { formatDuration } from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'

/**
 * Lecteur d'un segment d'enregistrement porte (durée, statut, lecteur audio à
 * la demande + fallback audio complet, transcription). Partagé entre la page
 * détail (expansion de porte) et la façade interactive de l'immeuble.
 */
export default function RecordingSegmentPlayer({ segment, autoLoad = false }) {
  const [segmentUrl, setSegmentUrl] = useState(null)
  const [loadingSegment, setLoadingSegment] = useState(false)
  const [originalUrl, setOriginalUrl] = useState(null)
  const [loadingOriginal, setLoadingOriginal] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const canLoadSegment = Boolean(segment.s3KeySegment)
  const canLoadOriginal = !canLoadSegment && segment.s3KeyOriginal

  const handleLoadSegment = async () => {
    if (!segment.s3KeySegment || loadingSegment) return

    setLoadingSegment(true)
    setAudioError(null)
    try {
      const url = await RecordingService.getStreamingUrl(segment.s3KeySegment)
      setSegmentUrl(url)
    } catch {
      setAudioError("Impossible de charger l'audio du segment.")
    } finally {
      setLoadingSegment(false)
    }
  }

  const handleLoadOriginal = async () => {
    if (!segment.s3KeyOriginal || loadingOriginal) return

    setLoadingOriginal(true)
    setAudioError(null)
    try {
      const url = await RecordingService.getStreamingUrl(segment.s3KeyOriginal)
      setOriginalUrl(url)
    } catch {
      setAudioError("Impossible de charger l'audio complet.")
    } finally {
      setLoadingOriginal(false)
    }
  }

  // Chargement automatique (modale) : pas de bouton, l'audio se prépare dès
  // l'affichage. Sur les autres surfaces (autoLoad=false) on garde le bouton.
  useEffect(() => {
    if (!autoLoad) return
    if (canLoadSegment) handleLoadSegment()
    else if (canLoadOriginal) handleLoadOriginal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, segment.s3KeySegment, segment.s3KeyOriginal])

  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <Mic className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums text-foreground">
            {formatDuration(segment.durationSec) ?? 'Durée inconnue'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {segment.statut && (
            <Badge className={`text-[10px] ${getStatusColor(segment.statut)}`}>
              {getStatusLabel(segment.statut)}
            </Badge>
          )}
        </div>
      </div>

      {segmentUrl ? (
        <AudioPlayer src={segmentUrl} />
      ) : originalUrl ? (
        <AudioPlayer src={originalUrl} />
      ) : segment.status === 'PENDING' || segment.status === 'PROCESSING' ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Traitement audio en cours...
        </div>
      ) : autoLoad && (canLoadSegment || canLoadOriginal) ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement de l'audio...
        </div>
      ) : canLoadSegment ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleLoadSegment}
          disabled={loadingSegment}
          className="h-8 gap-1.5"
        >
          {loadingSegment ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Charger l'audio
        </Button>
      ) : canLoadOriginal ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleLoadOriginal}
          disabled={loadingOriginal}
          className="h-8 gap-1.5"
        >
          {loadingOriginal ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Charger l'audio
        </Button>
      ) : (
        <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Aucun lecteur disponible pour ce segment.
        </div>
      )}

      {audioError && <p className="mt-2 text-[11px] text-destructive">{audioError}</p>}

      {segment.transcription && (
        <p className="mt-2 line-clamp-2 rounded-lg bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
          {segment.transcription}
        </p>
      )}
    </div>
  )
}
