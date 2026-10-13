import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Mic, PlayCircle } from 'lucide-react'
import AudioPlayer from '@/components/AudioPlayer'
import { useSegmentAudio } from '@/hooks/ecoutes/useSegmentAudio'
import { getStatusColor, getStatusLabel } from '@/constants/domain/porte-status'
import { formatDuration } from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'

/**
 * Lecteur d'un segment d'enregistrement porte (durée, statut, lecteur audio à
 * la demande). Partagé entre la page détail (expansion de porte) et la
 * façade interactive de l'immeuble.
 */
export default function RecordingSegmentPlayer({ segment, autoLoad = false }) {
  const { audioKey, audioUrl, loadingAudio, audioError, loadAudio, onWavesurferReady } =
    useSegmentAudio(segment, { autoLoad })

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

      {audioUrl ? (
        <AudioPlayer src={audioUrl} onWavesurferReady={onWavesurferReady} />
      ) : !audioKey ? (
        <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Aucun lecteur disponible pour ce segment.
        </div>
      ) : autoLoad && !audioError ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement de l'audio...
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={loadAudio}
          disabled={loadingAudio}
          className="h-8 gap-1.5"
        >
          {loadingAudio ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Charger l'audio
        </Button>
      )}

      {audioError && <p className="mt-2 text-[11px] text-destructive">{audioError}</p>}
    </div>
  )
}
