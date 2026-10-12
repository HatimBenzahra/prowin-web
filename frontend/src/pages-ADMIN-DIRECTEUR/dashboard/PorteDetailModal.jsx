import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  Clock,
  User,
  Calendar,
  MessageSquare,
  Mic,
  DoorOpen,
  PlayCircle,
} from 'lucide-react'
import { getStatusLabel, getStatusColor } from '@/constants/domain/porte-status'
import { usePorte, useRecordingSegmentsByPorte } from '@/hooks/metier/use-api'
import PorteHistoriqueTimeline from '../immeubles/components/PorteHistoriqueTimeline'
import { formatDuration } from '@/pages-ADMIN-DIRECTEUR/ecoutes/EnregistrementComponents'
import AudioPlayer from '@/components/AudioPlayer'
import { useSegmentAudio } from '@/hooks/ecoutes/useSegmentAudio'

function SegmentCard({ segment }) {
  const { audioKey, audioUrl, loadingAudio, audioError, loadAudio, onWavesurferReady } =
    useSegmentAudio(segment)
  const date = new Date(segment.createdAt)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const duration = formatDuration(segment.durationSec)

  return (
    <div className="rounded-xl border border-border/60 hover:border-border hover:shadow-sm transition-all duration-200 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
        </div>
      </div>

      {audioUrl ? (
        <AudioPlayer src={audioUrl} onWavesurferReady={onWavesurferReady} />
      ) : audioKey ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={loadAudio}
          disabled={loadingAudio}
          className="mb-2 h-8 gap-1.5"
        >
          {loadingAudio ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
          Charger l'audio
        </Button>
      ) : null}
      {audioError && <p className="mb-2 text-[11px] text-red-600">{audioError}</p>}
    </div>
  )
}

export default function PorteDetailModal({ open, onOpenChange, porteId, immeuble }) {
  const { data: porte, loading } = usePorte(porteId)
  const { data: segments, loading: segmentsLoading } = useRecordingSegmentsByPorte(porteId)

  const normalizedStatut = porte?.statut?.toUpperCase()
  const statusLabel = getStatusLabel(normalizedStatut)
  const statusColor = getStatusColor(normalizedStatut)

  const derniereVisite = porte?.derniereVisite
    ? new Date(porte.derniereVisite).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {loading ? (
                  'Chargement...'
                ) : porte ? (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <DoorOpen className="h-3.5 w-3.5 text-primary" />
                      </div>
                      Porte {porte.numero}
                    </span>
                    {porte.nomPersonnalise && (
                      <span className="text-muted-foreground font-normal text-[13px]">
                        — {porte.nomPersonnalise}
                      </span>
                    )}
                  </span>
                ) : (
                  'Porte introuvable'
                )}
              </DialogTitle>
              {immeuble && (
                <p className="text-[13px] text-muted-foreground mt-1">{immeuble.adresse}</p>
              )}
            </div>
            {normalizedStatut && (
              <Badge className={`${statusColor} shrink-0 mt-0.5`}>{statusLabel}</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : porte ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Étage
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold tabular-nums">{porte.etage}</p>
                </div>

                {derniereVisite && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="h-3 w-3 text-primary" />
                      </div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Dernière visite
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold tabular-nums">{derniereVisite}</p>
                  </div>
                )}

                {porte.nbRepassages > 0 && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Mic className="h-3 w-3 text-primary" />
                      </div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Repassages
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold tabular-nums">{porte.nbRepassages}</p>
                  </div>
                )}

                {porte.rdvDate && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                        <Calendar className="h-3 w-3 text-primary" />
                      </div>
                      <p className="text-[10px] font-medium text-primary/80 uppercase tracking-wide">
                        RDV
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold text-primary tabular-nums">
                      {new Date(porte.rdvDate).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                      {porte.rdvTime && ` à ${porte.rdvTime}`}
                    </p>
                  </div>
                )}
              </div>

              {porte.commentaire && (
                <div className="bg-muted/40 rounded-xl p-3 border border-border/50">
                  <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" />
                    Commentaire
                  </p>
                  <p className="text-[13px] italic text-muted-foreground leading-relaxed">
                    {porte.commentaire}
                  </p>
                </div>
              )}

              <Separator />

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mic className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h3 className="text-[13px] font-semibold">Enregistrements</h3>
                  {!segmentsLoading && segments && (
                    <Badge variant="secondary" className="text-[10px]">
                      {segments.length}
                    </Badge>
                  )}
                </div>

                {segmentsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-3 bg-muted/30 rounded-xl border border-border/60">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span className="text-[11px]">Chargement des enregistrements...</span>
                  </div>
                ) : segments && segments.length > 0 ? (
                  <div className="space-y-2">
                    {segments.map(segment => (
                      <SegmentCard key={segment.id} segment={segment} />
                    ))}
                  </div>
                ) : (
                  <div className="p-5 bg-muted/30 rounded-xl border border-border/60 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center mx-auto mb-2">
                      <Mic className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Aucun enregistrement</p>
                  </div>
                )}
              </section>

              <Separator />

              <section>
                <PorteHistoriqueTimeline porteId={porte.id} porteNumero={porte.numero} />
              </section>
            </>
          ) : (
            <div className="p-6 text-center">
              <p className="text-[13px] text-muted-foreground">Porte introuvable.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
