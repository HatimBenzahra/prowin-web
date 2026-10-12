import { useState } from 'react'
import { usePorteDetailsLogic } from './usePorteDetailsLogic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Mic,
  Clock,
  User,
  Calendar,
  MessageSquare,
  DoorOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  PlayCircle,
  AlertTriangle,
} from 'lucide-react'
import { getStatusLabel, getStatusColor } from '@/constants/domain/porte-status'
import PorteHistoriqueTimeline from './components/PorteHistoriqueTimeline'
import {
  SpeechScoreBar,
  formatDuration,
} from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'
import AudioPlayer from '@/components/AudioPlayer'
import { RecordingService } from '@/services/audio'

function SegmentCard({ segment }) {
  const [expanded, setExpanded] = useState(false)
  const [segmentUrl, setSegmentUrl] = useState(null)
  const [loadingSegment, setLoadingSegment] = useState(false)
  const [originalUrl, setOriginalUrl] = useState(null)
  const [loadingOriginal, setLoadingOriginal] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const date = new Date(segment.createdAt)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const duration = formatDuration(segment.durationSec)

  const truncateLimit = 180
  const hasLongTranscription = segment.transcription && segment.transcription.length > truncateLimit
  const displayedTranscription =
    hasLongTranscription && !expanded
      ? segment.transcription.slice(0, truncateLimit) + '…'
      : segment.transcription
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
      setAudioError("Impossible de charger l'enregistrement complet.")
    } finally {
      setLoadingOriginal(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 hover:border-border hover:shadow-sm transition-all duration-200 bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3 shrink-0" />
          <span>
            {dateStr} à {timeStr}
          </span>
          {duration && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{duration}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {segment.statut && (
            <Badge className={`text-[10px] ${getStatusColor(segment.statut)}`}>
              {getStatusLabel(segment.statut)}
            </Badge>
          )}
          {segment.speechScore != null && <SpeechScoreBar score={segment.speechScore} />}
          {segment.status && (
            <Badge variant="outline" className="text-[10px]">
              {segment.status}
            </Badge>
          )}
        </div>
      </div>

      {segmentUrl ? (
        <AudioPlayer src={segmentUrl} />
      ) : originalUrl ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Segment non découpé. Audio complet chargé, passage à écouter autour de{' '}
            <span className="font-medium tabular-nums">{formatDuration(segment.startTime)}</span>.
          </div>
          <AudioPlayer src={originalUrl} />
        </div>
      ) : segment.status === 'PENDING' || segment.status === 'PROCESSING' ? (
        <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-muted/30 border border-border/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Traitement audio en cours...</span>
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
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
          <div className="flex items-start gap-2 text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-[11px] leading-relaxed">
              Le découpage de ce segment n'est pas disponible. Tu peux écouter l'enregistrement
              complet et te placer autour de{' '}
              <span className="font-medium tabular-nums">{formatDuration(segment.startTime)}</span>.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleLoadOriginal}
            disabled={loadingOriginal}
            className="h-8 gap-1.5 bg-background"
          >
            {loadingOriginal ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Charger l'audio complet
          </Button>
        </div>
      ) : null}

      {audioError && <p className="mt-2 text-[11px] text-red-600">{audioError}</p>}

      {segment.transcription && (
        <div className="bg-muted/40 rounded-lg p-2.5 border border-border/40">
          <div className="flex items-start gap-1.5">
            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
            <div>
              <p className="text-[11px] italic text-muted-foreground leading-relaxed">
                {displayedTranscription}
              </p>
              {hasLongTranscription && (
                <button
                  type="button"
                  onClick={() => setExpanded(v => !v)}
                  className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-0.5"
                >
                  {expanded ? (
                    <>
                      Voir moins <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Voir plus <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PorteDetails() {
  const { porte, immeuble, segments, loading, segmentsLoading, error, goBack } =
    usePorteDetailsLogic()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-[13px]">Chargement de la fiche porte...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-5 border border-red-200 rounded-xl bg-red-50">
        <p className="text-[13px] text-red-800">Erreur lors du chargement : {error}</p>
      </div>
    )
  }

  if (!porte) {
    return (
      <div className="p-5 border border-border/60 rounded-xl bg-muted/30">
        <p className="text-[13px] text-muted-foreground">Porte introuvable.</p>
      </div>
    )
  }

  const normalizedStatut = porte.statut?.toUpperCase()
  const statusLabel = getStatusLabel(normalizedStatut)
  const statusColor = getStatusColor(normalizedStatut)

  const derniereVisite = porte.derniereVisite
    ? new Date(porte.derniereVisite).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={goBack} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <DoorOpen className="h-4 w-4 text-primary" />
              </div>
              Porte {porte.numero}
            </span>
            {porte.nomPersonnalise && (
              <span className="text-muted-foreground font-normal text-[15px]">
                — {porte.nomPersonnalise}
              </span>
            )}
          </h1>
          {immeuble && (
            <p className="text-[13px] text-muted-foreground mt-0.5">{immeuble.adresse}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <aside className="w-full lg:w-72 shrink-0 space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Informations
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Statut actuel
                </p>
                <Badge className={statusColor}>{statusLabel}</Badge>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Étage</p>
                    <p className="text-[13px] font-medium">Étage {porte.etage}</p>
                  </div>
                </div>

                {immeuble && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Bâtiment</p>
                      <p className="text-[13px] font-medium leading-snug">{immeuble.adresse}</p>
                    </div>
                  </div>
                )}

                {derniereVisite && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Dernière visite</p>
                      <p className="text-[13px] font-medium tabular-nums">{derniereVisite}</p>
                    </div>
                  </div>
                )}

                {porte.nbRepassages > 0 && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mic className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Repassages</p>
                      <p className="text-[13px] font-medium tabular-nums">{porte.nbRepassages}</p>
                    </div>
                  </div>
                )}

                {porte.rdvDate && (
                  <div className="flex items-center gap-2.5 bg-primary/5 border border-primary/20 rounded-xl p-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-primary/70">RDV programmé</p>
                      <p className="text-[13px] font-medium text-primary tabular-nums">
                        {new Date(porte.rdvDate).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {porte.rdvTime && ` à ${porte.rdvTime}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {porte.commentaire && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      Commentaire
                    </p>
                    <p className="text-[13px] italic text-muted-foreground leading-relaxed bg-muted/40 rounded-lg p-2.5 border border-border/40">
                      {porte.commentaire}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="flex-1 min-w-0 space-y-6">
          <section>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Mic className="h-3.5 w-3.5 text-primary" />
              </div>
              <h2 className="text-[13px] font-semibold">Enregistrements</h2>
              {!segmentsLoading && segments && (
                <Badge variant="secondary" className="text-[10px]">
                  {segments.length} segment{segments.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {segmentsLoading ? (
              <div className="flex items-center gap-2.5 text-muted-foreground p-4 bg-muted/30 rounded-xl border border-border/60">
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                <span className="text-[11px]">Chargement des enregistrements...</span>
              </div>
            ) : segments && segments.length > 0 ? (
              <div className="space-y-2.5">
                {segments.map(segment => (
                  <SegmentCard key={segment.id} segment={segment} />
                ))}
              </div>
            ) : (
              <div className="p-8 bg-muted/30 rounded-xl border border-border/60 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                  <Mic className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-[13px] text-muted-foreground">Aucun enregistrement disponible</p>
              </div>
            )}
          </section>

          <Separator />

          <section>
            <PorteHistoriqueTimeline porteId={porte.id} porteNumero={porte.numero} />
          </section>
        </main>
      </div>
    </div>
  )
}
